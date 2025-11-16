import soap from "soap";
import dotenv from "dotenv";
dotenv.configDotenv();
import {redisClient} from "../Clients/RedisClients.ts";

const user = String(process.env.DETOK_USER);
const pass =String(process.env.DETOK_PASS);
const WSDL_URL = "https://gt.skytrack.detektorgps.com/gps_gt/ws_replica/servidor.php?wsdl";

type ReplicaArgs =
     { usuario: string; clave: string; limpiar: string };

export async function fetchReplica(limpiar: string) {

    const cred: ReplicaArgs = {
        usuario:user,
        clave:pass,
        limpiar: limpiar ?? "false",
    }
    const client = await soap.createClientAsync(WSDL_URL);

    const [result] = await client.replicaAsync(cred);

    const pilaValue = result.pila.$value


    let parsed: unknown = pilaValue;
    if (typeof pilaValue === "string") {
        try {
            parsed = JSON.parse(pilaValue);
        } catch {
            parsed = pilaValue;
        }
    }

    // @ts-ignore
    return await mapDetektorDataset(parsed)
}


// @ts-ignore
const toNum = v => (v === null || v === undefined || v === "" ? null : Number(v));
// @ts-ignore
const toInt = v => (v === null || v === undefined || v === "" ? null : parseInt(v, 10));

// @ts-ignore
function mapRow(r) {
    return {
        placa: r[0],                              // [0]
        equipo_id: r[1],                          // [1]
        motivo_codigo: r[2],                      // [2]
        fecha_gps: r[3],                          // [3]
        ignicion: r[4] === "1",                   // [4]
        bateria_principal_detectada: r[5] ===                                                           "1",// [5]
        voltaje_bateria: toNum(r[6]),             // [6]
        rumbo_grados: toInt(r[7]),                // [7]
        lat: toNum(r[8]),                         // [8]
        lng: toNum(r[9]),                         // [9]
        velocidad_kmh: toNum(r[10]),              // [10]
        altitud_m: toNum(r[11]),                  // [11]
        distancia_recorrida_m: toInt(r[12]),      // [12]
        fecha_grabacion: r[13],                   // [13]
        id: r[14] ?? null                   // [14]
    };
}

// @ts-ignore
async function mapDetektorDataset(rows: any[]) {
    const norm = Array.isArray(rows) ? rows.map(mapRow) : [];

    // ===== Helpers Redis (compatibles con node-redis e ioredis) =====
    async function setWithTTL_NX(key: string, value: any, seconds = 86400) {
        const payload = typeof value === "string" ? value : JSON.stringify(value);

        // 1) node-redis moderno: set(key, value, { EX, NX })
        try {
            // @ts-ignore
            await redisClient.set(key, payload, { EX: seconds, NX: true });
            return true; // true = set OK o ya quedó "intento" hecho
        } catch {}
    }

    async function scanKeys(pattern: string): Promise<string[]> {
        const out: string[] = [];
        // Preferimos SCAN para no bloquear. Si falla, probamos KEYS.
        try {
            let cursor = "0";
            do {
                // @ts-ignore
                const res = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 200);
                // @ts-ignore
                cursor = res?.[0] ?? "0";
                // @ts-ignore
                const batch: string[] = res?.[1] ?? [];
                if (batch?.length) out.push(...batch);
            } while (cursor !== "0");
            if (out.length) return out;
        } catch {}
        try {
            // @ts-ignore
            const k = await redisClient.keys(pattern);
            return k || [];
        } catch {}
        return [];
    }

    async function mget(keys: string[]): Promise<(string | null)[]> {
        if (!keys.length) return [];
        // node-redis moderno soporta mGet; ioredis usa mget.
        try {
            // @ts-ignore
            if (redisClient.mGet) return await redisClient.mGet(keys);
        } catch {}
        try {
            // @ts-ignore
            if (redisClient.mget) return await redisClient.mget(keys);
        } catch {}
        // Fallback: GET individual
        // @ts-ignore
        return Promise.all(keys.map(k => redisClient.get ? redisClient.get(k) : Promise.resolve(null)));
    }

    // ===== 1) Guardar cada punto con clave única por timestamp =====
    // Clave: `${id}:${fecha_gps}` (normalizamos espacios por 'T' para evitar líos)
    const idsVistos = new Set<string>();
    await Promise.all(
        norm.map(async (registro: any) => {
            const id = registro?.id ?? registro?.equipo_id ?? registro?.placa;
            const fecha = registro?.fecha_gps;
            if (!id || !fecha) return;

            idsVistos.add(String(id));

            const fechaKey = String(fecha).trim().replace(/\s+/g, "T");
            const key = `${id}:${fechaKey}`;

            // Dedupe por timestamp: si ya existe, NX evitará sobreescritura
            await setWithTTL_NX(key, registro, 24 * 3600);
        })
    );

    // ===== 2) Leer TODO lo acumulado para los ids de esta ronda =====
    const allPoints: any[] = [];
    for (const id of idsVistos) {
        const pattern = `${id}:*`;
        const keys = await scanKeys(pattern);
        if (!keys.length) continue;

        const rawVals = await mget(keys);
        for (const v of rawVals) {
            if (v == null) continue;
            try {
                allPoints.push(JSON.parse(v));
            } catch {
                // por si alguien guardó sin JSON.stringify en el pasado
                allPoints.push(v);
            }
        }
    }

    // ===== 3) Dedupe defensivo por (id + fecha_gps) =====
    // En teoría no debería haber duplicados si usamos NX, pero por si acaso:
    const seen = new Set<string>();
    const deduped = allPoints.filter((p: any) => {
        const sig = `${p?.id ?? p?.equipo_id ?? p?.placa}||${p?.fecha_gps}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });

    // ===== 4) Orden final por fecha_gps ASC =====
    deduped.sort((a: any, b: any) => {
        const ta = a?.fecha_gps ? new Date(String(a.fecha_gps)).getTime() : 0;
        const tb = b?.fecha_gps ? new Date(String(b.fecha_gps)).getTime() : 0;
        return ta - tb;
    });

    deduped.sort((a: any, b: any) => {
        const ta = a?.fecha_gps ? new Date(String(a.fecha_gps)).getTime() : 0;
        const tb = b?.fecha_gps ? new Date(String(b.fecha_gps)).getTime() : 0;
        return ta - tb;
    });

// ===== 5) Agrupar por id =====
    const grouped: Record<string, any[]> = {};
    for (const p of deduped) {
        const id = String(p?.id ?? p?.equipo_id ?? p?.placa ?? "unknown");
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(p);
    }

// Devolvemos objeto agrupado por id
    return grouped;   
}

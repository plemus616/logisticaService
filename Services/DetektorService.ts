import soap from "soap";

const WSDL_URL = "https://gt.skytrack.detektorgps.com/gps_gt/ws_replica/servidor.php?wsdl";

type ReplicaArgs =
     { usuario: string; clave: string; limpiar: string };

export async function fetchReplica(limpiar: string) {
    const cred: ReplicaArgs = {
        usuario:"ITROTOTEC",
        clave:"1111",
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

    return mapDetektorDataset(parsed)
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
function mapDetektorDataset(rows) {
    return rows.map(mapRow);
}

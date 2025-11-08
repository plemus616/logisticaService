import type {FastifyReply, FastifyRequest} from "fastify";
import {fetchReplica} from "../Services/DetektorService.js";
import dotenv from "dotenv";

dotenv.config();
export async function DetektorController(req: FastifyRequest, rep: FastifyReply){
    // @ts-ignore
    const limpiar = req.query.limpiar;
    try{
        // @ts-ignore
        const w = await fetchReplica(limpiar);
        return rep.code(200).send(w);
    } catch (e){
        console.error(e);
        return rep.code(500).send(e);
    }
}
import type {FastifyInstance} from "fastify";
import {DetektorController} from "../Controllers/DetektorController.ts";

export async function DetektorRoutes(router: FastifyInstance){
    router.get("/fetchDetektor", DetektorController);
}
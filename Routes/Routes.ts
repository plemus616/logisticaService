import type {FastifyInstance} from "fastify";
import {DetektorController} from "../Controllers/DetektorController.js";

export async function DetektorRoutes(router: FastifyInstance){
    router.get("/fetchDetektor", DetektorController);
}
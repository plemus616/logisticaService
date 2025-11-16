import Fastify from 'fastify';
import dotenv from 'dotenv';
import {DetektorRoutes} from "./Routes/Routes.ts";
import cors from "@fastify/cors";
dotenv.config();
const server = Fastify({
    logger: true
});
server.register(cors, {
    origin: '*',
    methods: ["GET", "POST", "OPTIONS"]
})
server.register(DetektorRoutes);

server.listen({port: Number(process.env.PORT), host: '0.0.0.0'}, err=>{
    if(err){
        server.log.error(err);
        process.exit(1);
    }
})
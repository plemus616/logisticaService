import {createClient} from '@redis/client';

export const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

try{
    await redisClient.connect();
    console.log("Conectado a redis")
} catch (err){
    console.error(`Error de conexion en redis ${err}`)
}
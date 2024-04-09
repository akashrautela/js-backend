// require('dotenv').config();
import dotenv from "dotenv"
import connectDB from "./db/index.js";
dotenv.config({
    path:'./env'
})

connectDB();


//less modularised code below
/*
import express from "express"
const app = express();

;(async ()=>{
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        //express cannot link with db
        app.on("error", (err)=>{
            console.log("ERROR: ",err);
            throw err;
        })
        app.listen(process.env.PORT, ()=>{
            console.log(`App is listening on port ${process.env.PORT}`);
        })
    } catch (error) {
        console.error("ERROR: ",error);
        throw error;
    }
})()*/
import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import jwt from "jsonwebtoken";
import {User} from "../models/user.model.js"

export const verifyJWT = asyncHandler ( async (req,res,next) => {
    try {
        const accessToken = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    
        if(!accessToken){
            throw new ApiError(401, "Unauthorized request");
        }
    
        const decodedToken = await jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id)
                .select("-password -refreshToken");
    
        if(!user){
            //TODO: discuss about frontend
            throw new ApiError(401, "InValid access token");
        }
    
        req.user = user;
    
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access token");
    }
}) 
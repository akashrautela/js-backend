import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) =>{
    try {
        const user = await User.findById(userId);
      
        
        const refreshToken = user.generateRefreshToken();
        const accessToken = user.generateAccessToken();

        user.refreshToken = refreshToken;

        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};

    } catch (error) {
        throw new ApiError(500, error?.message || "Something went wrong while generating refresh and access tokens")
    }
};

const registerUser = asyncHandler( async (req,res)=>{
    //get user details from frontend(req body)
    const {fullName, email, username, password} = req.body

    //data validation - not empty atleast
    if(
        [fullName,email,username,password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");
    }

    //check if user already exists: username and email
    const existedUser = await User.findOne({
        $or: [ {username},{email}]  //find User if either username or email present
    });
    if(existedUser){
        throw new ApiError(409, "User with email or username already exists");
    }

    //check files : avatar and images using multer
    const avatarLocalPath = req?.files?.avatar[0]?.path;
    // const coverImagelocalPath = req?.files?.coverImage[0]?.path;

    let coverImagelocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImagelocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }
    //coverImage is optional

    //upload images to cloudinary, check if avatar uploaded to cloudinary successfully
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImagelocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar file is required");
    }

    //create user object - create entry in mongo DB
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    });

    //remove password and refresh token field from response
    const createdUser = await User.findById(user._id)?.select(
        "-password -refreshToken"
    )

    //check for user creation
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering a user.")
    }

    //return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    );
});

const loginUser = asyncHandler ( async (req,res) =>{
    //fetch data from req body
    const {email, username, password} = req.body;

    //data validation -> username or email
    if(!email && !username){
        throw new ApiError(400,"Email or username is required")
    }

    //check whether user exists in db or not
    const existedUser = await User.findOne({
        $or:[{email},{username}]
    });
    
    if(!existedUser){  
        throw new ApiError(404, "User does not exist")
    }

    //check request body pasword and user pasword from db is same or not
    const isPasswordValid = await existedUser.isPasswordCorrect(password);   

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials.")
    }

    //create refresh token and save it to DB for the logged in user.
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(existedUser._id);

    const loggedInUser = await User.findById(existedUser._id)
                                    .select("-password -refreshToken");

    //send cookies with response
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in successfully."
        )
    );

});

const logOutUser = asyncHandler(async(req,res) => {
    //take data from req body
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    );
    
    //remove accessToken and refreshToken from user
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshCookie", options)
    .json(
        new ApiResponse(200,{},"User logged out successfully")
    )

    
});

const refreshAccessToken = asyncHandler ( async(req,res) => {
    //take current refresh token from req.cookies
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    
    //data validation for incoming refresh token
    if(!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorised request");
    }

    try {
        //verify incoming refresh token
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id);
        if(!user){
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used");
        }
    
        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user?._id);
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200,{accessToken, refreshToken},"Access token refreshed")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh token")
    }
});

const changeCurrentUserPassword = asyncHandler( async(req,res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password changed successfully"));

});

const getCurrentUser = asyncHandler ( async(req,res) =>{
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"))
});

const updateAccountDetails = asyncHandler ( async(req,res) => {
    const {fullName, email} = req.body;

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id, 
        {
            $set: {
                fullName,     //new es6 syntax (if key and valu are same)
                email: email  //old syntax
            }
        },
        {new: true} 
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, updatedUser, "Account details updated successfully")
    );

});

const updateUserAvatar = asyncHandler( async (req,res) =>{
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading avatar on cloudinary");
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            } 
        },
        {new:false}
    ).select("-password");

    return res.status(200).json(new ApiResponse(200,updatedUser,"Avatar updated successfully"));
  
});

const updateUserCoverImage = asyncHandler( async (req,res) =>{
    
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover Image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading Cover Image on cloudinary");
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            } 
        },
        {new:false}
    ).select("-password");

    return res.status(200).json(new ApiResponse(200,updatedUser,"cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler (async(req,res)=>{
    const {username} = req.params;
    
    if(!username?.trim()){
        throw new ApiError(400,"Username is missing");
    }

    const channel = await User.aggregate([
        {
            //1st pipeline - where condition - what basis condition should be matched
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            //2nd pipeline
            //find all sbscribers
            $lookup:{
                from: "Subscription",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            //3rd pipeline
            //find no of subscribers
            $lookup:{
                from: "Subscription",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if: {$in:[req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName:1,
                username:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ]);

    console.log(channel); //very much needed what is structure of channel

    if(!channel?.length){
        throw new ApiError(404, "channel does not exists");
    }

    return res
    .status(200)
    .json(
        new ApiError(200, channel[0], "USer channel fetched successfully")
    );

});

const getWatchHistory = asyncHandler (async (req,res) =>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"Video",
                localField:"watchHistory",
                foreignField:"_id",
                as: "watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"User",
                            localField:"owner",
                            foreignField:"_id",
                            as: "owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ]);

    return res.status(200).json(new ApiResponse(200,user[0].watchHistory,"watched history fetched successfully")) 
});


export {
    registerUser,
    loginUser,
    logOutUser,
    refreshAccessToken,
    changeCurrentUserPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};


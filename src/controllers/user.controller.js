import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshTokens = async (userId) =>{
    try {
        const user = await User.findById(userId);
        const refreshToken = user.generateRefreshToken();
        const accessToken = user.generateAccessToken();
        
        user.refreshToken = refreshToken;

        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access tokens")
    }
}

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
    if(!email || !username){
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
                                    .select("-password -refreshToekn");

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

    
})


export {
    registerUser,
    loginUser,
    logOutUser
};


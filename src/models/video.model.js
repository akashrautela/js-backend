import mongoose,{ Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videFile:{
            type:String, //cloudinary url
            required:true
        },
        thumbnails:{
            type:String,
            required:true
        },
        title:{
            type:String,
            required:true
        },
        description:{
            type:String,
            required:true
        },
        duration:{
            type:Number, //will fetch from file info from cloudinary
            required:true
        },
        views:{
            type:Number,
            default:0,
        },
        isPublished:{
            type:Boolean,
            default:true
        },
        Owner : {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    }
    ,{timestamps:true}
);

videoSchema.plugin(mongooseAggregatePaginate);
export const Video = mongoose.model("Video", videoSchema);
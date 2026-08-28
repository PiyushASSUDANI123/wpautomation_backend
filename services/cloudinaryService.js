const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");



cloudinary.config({
  secure: true,
});

const uploadBufferToCloudinary = (buffer, folder = "wp_automation", resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const uploadFileToCloudinary = async (filePath, folder = "wp_automation", resourceType = "auto") => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: resourceType,
    });
    return result.secure_url;
  } catch (error) {
    console.error("❌ Cloudinary file upload error:", error);
    throw error;
  }
};

module.exports = {
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
};

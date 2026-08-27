const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// Configure Cloudinary (requires CLOUDINARY_URL in .env)
// Example: CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@<your_cloud_name>
cloudinary.config({
  secure: true,
});

/**
 * Uploads a file buffer or stream to Cloudinary
 * @param {Buffer} buffer - The file buffer to upload
 * @param {string} folder - The folder in Cloudinary to upload to
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @returns {Promise<string>} The secure URL of the uploaded file
 */
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

/**
 * Uploads a local file to Cloudinary
 * @param {string} filePath - Path to the local file
 * @param {string} folder - The folder in Cloudinary to upload to
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @returns {Promise<string>} The secure URL of the uploaded file
 */
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

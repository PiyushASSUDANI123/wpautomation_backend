const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const uploadExcelToSupabase = async (buffer, filename, bucket = "excel-sheets") => {
  if (!supabase) {
    console.warn("Supabase client not initialized. Check SUPABASE_URL and SUPABASE_KEY.");
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (error) {
      console.error("❌ Supabase storage upload error:", error);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("❌ Failed to upload Excel to Supabase:", err.message);
    throw err;
  }
};

module.exports = {
  supabase,
  uploadExcelToSupabase,
};

import axios from "axios";

export async function fetchDriveMedia() {
  const res = await axios.get("/api/drive");
  return res.data.files;
}

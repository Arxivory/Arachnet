export const DEVICE_PROFILE_DRAG_TYPE = "application/x-arachnet-device-profile";

export function readDeviceProfileId(dataTransfer) {
  const payload = dataTransfer.getData(DEVICE_PROFILE_DRAG_TYPE);
  if (!payload) return null;
  const parsed = JSON.parse(payload);
  if (parsed?.type !== "arachnet/device-profile" || typeof parsed.profileId !== "string") {
    throw new TypeError("The dragged item is not a valid device profile.");
  }
  return parsed.profileId;
}

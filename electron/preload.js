const { contextBridge } = require("electron");
const path = require("path");

const isDev = true; 
const basePath = process.cwd();

contextBridge.exposeInMainWorld("electron", {
  getAssetPath: (assetPath) => {
    assetPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    
    const fullPath = path.join(basePath, 'public', assetPath);
    
    const fileUrl = 'file:///' + fullPath.replace(/\\/g, '/');
    
    console.log('Original path:', assetPath);
    console.log('Full path:', fullPath);
    console.log('File URL:', fileUrl);
    
    return fileUrl;
  }
});

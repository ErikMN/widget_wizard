/* CGI endpoints */
export const SR_CGI = '/axis-cgi/systemready.cgi';
export const W_CGI = '/axis-cgi/overlaywidget/overlaywidget.cgi';
export const P_CGI = '/axis-cgi/param.cgi?action=list';
export const P1_CGI = '/axis-cgi/param.cgi';

/* Drawer width and auto-close offset */
export const drawerWidth = 360; // Official web UI uses 360px for widget drawer and 270px for main drawer
export const drawerHeight = '60vh'; // For mobile mode
export const appbarHeight = '54px'; // Official web UI uses 54px for app bar height

// export function buildUrl(cgiPath: string): string {
//   const url = deviceIP ? `http://${deviceIP}${cgiPath}` : cgiPath;
//   console.log('Built URL:', url);
//   return url;
// }

export function buildUrl(deviceIP: string | null, cgiPath: string): string {
  if (!deviceIP) {
    throw new Error('Device IP is not set. Cannot build URL.');
  }
  const url = `http://${deviceIP}${cgiPath}`;
  console.log('Built URL:', url);
  return url;
}

import QRCode from "qrcode";
import { PALETTE as P } from "@/lib/design/palette";

// Server-only QR helpers for event signup/feedback/ticket links. Renders an
// inline SVG (for dangerouslySetInnerHTML) and a PNG data URL (for the
// admin's "download PNG" button). NEVER import from a client component.

export async function qrSvg(data: string): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: P.dark, light: P.white },
  });
}

export async function qrPngDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    margin: 1,
    width: 480,
    errorCorrectionLevel: "M",
    color: { dark: P.dark, light: P.white },
  });
}

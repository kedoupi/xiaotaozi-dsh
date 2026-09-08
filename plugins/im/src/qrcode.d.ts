declare module "qrcode" {
  type QrToDataURLOptions = {
    type?: string;
    errorCorrectionLevel?: string;
    margin?: number;
    width?: number;
  };

  const QRCode: {
    toDataURL: (text: string, options?: QrToDataURLOptions) => Promise<string>;
    toBuffer?: (text: string, options?: Record<string, unknown>) => Promise<Buffer>;
  };

  export default QRCode;
}

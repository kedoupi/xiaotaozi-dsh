import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

export interface ImageAttachmentRef {
  attachmentId: string;
  mediaType: string;
  bytes: number;
  width: number;
  height: number;
  name?: string;
}

export type ImageLoader = (attachment: ImageAttachmentRef) => Promise<string>;

export interface ImageLightboxLabels {
  dialog: string;
  close: string;
}

export interface MessageImageLabels {
  image: string;
  open: string;
  openNamed: (label: string) => string;
  loading: string;
  loadFailed: string;
  lightbox: ImageLightboxLabels;
}

function singleFit(attachment: ImageAttachmentRef): { width: number; height: number; objectPosition: string } {
  const natural = attachment.width / attachment.height;
  const ratio = Math.min(4, Math.max(0.25, natural));
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 };
  const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height);
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? "center top" : natural > 4 ? "left center" : "center",
  };
}

const styles: Record<string, CSSProperties> = {
  gallery: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" },
  frame: {
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    padding: 0,
    border: "1px solid var(--dsw-alias-border-l2-darkmode-thin)",
    borderRadius: 8,
    background: "var(--dsw-alias-interactive-bg-hover-solid)",
    cursor: "zoom-in",
  },
  tile: { width: 64, height: 64 },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  loading: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", padding: "0 8px" },
  error: {
    fontSize: 12,
    color: "var(--dsw-alias-state-error-primary)",
    cursor: "pointer",
    border: "1px solid var(--dsw-alias-border-l2-darkmode-thin)",
    borderRadius: 8,
    background: "transparent",
    padding: "6px 10px",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    background: "rgba(0, 0, 0, 0.72)",
    padding: 24,
  },
  overlayImg: { maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 4 },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
    background: "rgba(255, 255, 255, 0.16)",
    color: "#fff",
    fontSize: 16,
    lineHeight: 1,
  },
};

function ImageLightbox({ src, alt, labels, onClose }: {
  src: string;
  alt: string;
  labels: ImageLightboxLabels;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-label={labels.dialog} style={styles.overlay} onClick={onClose}>
      <img src={src} alt={alt} style={styles.overlayImg} onClick={(event) => { event.stopPropagation(); }} />
      <button type="button" aria-label={labels.close} style={styles.close} onClick={onClose}>×</button>
    </div>
  );
}

export function MessageImage({ attachment, load, variant, labels }: {
  attachment: ImageAttachmentRef;
  load: ImageLoader;
  variant: "single" | "tile";
  labels: MessageImageLabels;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setAttempt((current) => current + 1); }, []);
  const close = useCallback(() => { setOpen(false); }, []);
  const fit = useMemo(
    () => (variant === "single" ? singleFit(attachment) : undefined),
    [attachment, variant],
  );

  useEffect(() => {
    let live = true;
    setError(false);
    setSrc(null);
    void load(attachment).then((url) => { if (live) setSrc(url); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [attachment, load, attempt]);

  const label = attachment.name ?? labels.image;
  if (error) {
    return <button type="button" style={styles.error} onClick={retry}>{labels.loadFailed}</button>;
  }
  const box = fit === undefined ? styles.tile : { width: fit.width, height: fit.height };
  return (
    <>
      <button
        type="button"
        style={{ ...styles.frame, ...box }}
        title={labels.open}
        aria-label={labels.openNamed(label)}
        onClick={() => { if (src !== null) setOpen(true); }}
      >
        {src === null
          ? <span style={styles.loading}>{labels.loading}</span>
          : <img src={src} alt={label} style={{ ...styles.img, objectPosition: fit?.objectPosition }} />}
      </button>
      {open && src !== null && <ImageLightbox src={src} alt={label} labels={labels.lightbox} onClose={close} />}
    </>
  );
}

export function ImageGallery({ images, load, labels }: {
  images: readonly { attachment: ImageAttachmentRef }[];
  load: ImageLoader;
  labels: MessageImageLabels;
}) {
  if (images.length === 0) return null;
  const variant = images.length === 1 ? "single" : "tile";
  return (
    <div style={styles.gallery}>
      {images.map((image, index) => (
        <MessageImage
          key={`${image.attachment.attachmentId}:${String(index)}`}
          attachment={image.attachment}
          load={load}
          variant={variant}
          labels={labels}
        />
      ))}
    </div>
  );
}

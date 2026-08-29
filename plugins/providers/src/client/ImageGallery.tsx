import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CloseIcon } from "./icons.tsx";

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
  loading: { fontSize: 12, color: "var(--dsw-alias-label-secondary)", padding: "0 8px" },
  error: {
    fontSize: 12,
    color: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 64%, var(--dsw-alias-label-primary, #111827))",
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
    background: "var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 72%))",
    padding: 24,
  },
  overlayImg: { maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
    background: "color-mix(in srgb, var(--dsw-alias-label-primary-inverted, #fff) 16%, transparent)",
    color: "var(--dsw-alias-label-primary-inverted, #fff)",
  },
};

function ImageLightbox({ src, alt, labels, onClose, returnFocus }: {
  src: string;
  alt: string;
  labels: ImageLightboxLabels;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnFocus.current?.focus();
    };
  }, [onClose, returnFocus]);
  return (
    <div role="dialog" aria-modal="true" aria-label={labels.dialog} style={styles.overlay} onClick={onClose}>
      <img src={src} alt={alt} style={styles.overlayImg} onClick={(event) => { event.stopPropagation(); }} />
      <button ref={closeRef} type="button" className="dshMedia-close" aria-label={labels.close} style={styles.close} onClick={onClose}>
        <span aria-hidden="true"><CloseIcon /></span>
      </button>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const retry = useCallback(() => { setAttempt((current) => current + 1); }, []);
  const close = useCallback(() => { setOpen(false); }, []);
  const fit = useMemo(
    () => (variant === "single" ? singleFit(attachment) : undefined),
    [attachment, variant],
  );

  const attachmentId = attachment.attachmentId;
  useEffect(() => {
    let live = true;
    setError(false);
    setSrc(null);
    void load(attachment).then((url) => { if (live) setSrc(url); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [attachmentId, load, attempt]);

  const label = attachment.name ?? labels.image;
  if (error) {
    return <button type="button" className="dshMedia-error" style={styles.error} onClick={retry}>{labels.loadFailed}</button>;
  }
  const box = fit === undefined ? styles.tile : { width: fit.width, height: fit.height };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="dshMedia-frame"
        style={{ ...styles.frame, ...box }}
        title={labels.open}
        aria-label={labels.openNamed(label)}
        aria-busy={src === null ? true : undefined}
        disabled={src === null}
        onClick={() => { if (src !== null) setOpen(true); }}
      >
        {src === null
          ? <span role="status" aria-live="polite" style={styles.loading}>{labels.loading}</span>
          : <img src={src} alt={label} loading="lazy" decoding="async" style={{ ...styles.img, objectPosition: fit?.objectPosition }} />}
      </button>
      {open && src !== null && <ImageLightbox src={src} alt={label} labels={labels.lightbox} onClose={close} returnFocus={triggerRef} />}
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

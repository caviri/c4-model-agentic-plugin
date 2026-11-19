import { MouseEvent, useRef, useState } from "react";

import { Box } from "../api/client";

interface Props {
  imageUrl: string;
  boxes: Box[];
  /** Label given to newly drawn boxes. */
  label?: string;
  /** Omit to render read-only (review mode). */
  onChange?: (boxes: Box[]) => void;
}

/** Shows an image with its boxes; in edit mode, dragging draws a new box. */
export function BoundingBoxCanvas({ imageUrl, boxes, label = "object", onChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1); // displayed pixels per original-image pixel
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Boxes are stored in original-image pixels, so convert from screen coordinates.
  function toImagePoint(event: MouseEvent) {
    const rect = imgRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  function finishDrag(event: MouseEvent) {
    if (!dragStart || !onChange) return;
    const end = toImagePoint(event);
    const box: Box = {
      label,
      x: Math.min(dragStart.x, end.x),
      y: Math.min(dragStart.y, end.y),
      width: Math.abs(end.x - dragStart.x),
      height: Math.abs(end.y - dragStart.y),
    };
    setDragStart(null);
    if (box.width > 2 && box.height > 2) onChange([...boxes, box]);
  }

  return (
    <div
      style={{ position: "relative", display: "inline-block", cursor: onChange ? "crosshair" : "default" }}
      onMouseDown={(e) => onChange && setDragStart(toImagePoint(e))}
      onMouseUp={finishDrag}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        style={{ maxWidth: "100%", display: "block" }}
        onLoad={(e) => setScale(e.currentTarget.clientWidth / e.currentTarget.naturalWidth)}
      />
      {boxes.map((box, index) => (
        <div
          key={index}
          title={box.label}
          onDoubleClick={() => onChange?.(boxes.filter((_, i) => i !== index))}
          style={{
            position: "absolute",
            left: box.x * scale,
            top: box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
            border: "2px solid #e11d48",
          }}
        >
          <span style={{ background: "#e11d48", color: "white", fontSize: 12 }}>{box.label}</span>
        </div>
      ))}
    </div>
  );
}

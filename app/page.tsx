"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Block = {
  id: string;
  title: string;
  start: number;
  duration: number;
  color: string;
};

const DAY = 1440;
const SNAP = 5;

const COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
];

export default function Home() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const timelineRef = useRef<HTMLDivElement>(null);
  const startPickerOpen = useRef(false);
  const endPickerOpen = useRef(false);

  const interaction = useRef<{
    type: "move" | "resize-left" | "resize-right";
    id: string;
    startMouseMin: number;
    originalStart: number;
    originalDuration: number;
    lastValidStart: number;
    dragDirection: number; // positive = right, negative = left
  } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("asteria-blocks");
    if (saved) setBlocks(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("asteria-blocks", JSON.stringify(blocks));
  }, [blocks]);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (mins: number) => {
    const total = Math.round(mins);
    const h24 = Math.floor(total / 60) % 24;
    const m = total % 60;
    const period = h24 >= 12 ? "pm" : "am";
    const h12 = h24 % 12 || 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const pxToMinutes = (px: number, width: number) => (px / width) * DAY;

  const snap = (value: number) => Math.round(value / SNAP) * SNAP;

  const roundTimeTo5 = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const total = h * 60 + m;
    const rounded = snap(total);
    const rh = Math.floor(rounded / 60) % 24;
    const rm = rounded % 60;
    return `${rh.toString().padStart(2, "0")}:${rm.toString().padStart(2, "0")}`;
  };

  const getOverlappingBlock = (start: number, duration: number, ignoreId: string) => {
    const end = start + duration;
    return blocks.find((b) => {
      if (b.id === ignoreId) return false;
      const bEnd = b.start + b.duration;
      return start < bEnd && end > b.start;
    });
  };

  const resolveMove = (
    proposedStart: number,
    duration: number,
    ignoreId: string,
    lastValid: number,
    direction: number
  ) => {
    let s = snap(Math.max(0, Math.min(DAY - duration, proposedStart)));
    const d = snap(Math.max(15, duration));

    const blocker = getOverlappingBlock(s, d, ignoreId);
    if (!blocker) {
      return { start: s, duration: d };
    }

    // Jump to the other side based on drag direction
    let jumped: number;
    if (direction > 0) {
      // Moving right → place after the blocker
      jumped = blocker.start + blocker.duration;
    } else {
      // Moving left → place before the blocker
      jumped = blocker.start - d;
    }

    jumped = snap(Math.max(0, Math.min(DAY - d, jumped)));

    if (!getOverlappingBlock(jumped, d, ignoreId)) {
      return { start: jumped, duration: d };
    }

    // Fallback: stay at last valid position
    return { start: lastValid, duration: d };
  };

  const addBlock = () => {
    if (!title.trim()) return;
    const roundedStart = roundTimeTo5(start);
    const roundedEnd = roundTimeTo5(end);
    const startMin = timeToMinutes(roundedStart);
    const endMin = timeToMinutes(roundedEnd);
    let rawDuration = endMin - startMin;
    if (rawDuration <= 0) rawDuration = 15;

    const result = resolveMove(startMin, rawDuration, "", startMin, 1);
    if (getOverlappingBlock(result.start, result.duration, "")) {
      alert("That time overlaps another block.");
      return;
    }

    const color = COLORS[blocks.length % COLORS.length];
    setBlocks((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        title: title.trim(),
        start: result.start,
        duration: result.duration,
        color,
      },
    ]);
    setTitle("");
  };

  const toggleTimePicker = (
    input: HTMLInputElement,
    openRef: React.MutableRefObject<boolean>
  ) => {
    if (openRef.current) {
      input.blur();
      openRef.current = false;
    } else {
      input.focus();
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {}
      }
      openRef.current = true;
    }
  };

  const onPointerDown = (
    e: React.PointerEvent,
    block: Block,
    type: "move" | "resize-left" | "resize-right"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseMin = pxToMinutes(e.clientX - rect.left, rect.width);

    interaction.current = {
      type,
      id: block.id,
      startMouseMin: mouseMin,
      originalStart: block.start,
      originalDuration: block.duration,
      lastValidStart: block.start,
      dragDirection: 0,
    };
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!interaction.current || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseMin = pxToMinutes(e.clientX - rect.left, rect.width);
      const delta = mouseMin - interaction.current.startMouseMin;

      // Track direction
      if (Math.abs(delta) > 2) {
        interaction.current.dragDirection = delta > 0 ? 1 : -1;
      }

      const { type, id, originalStart, originalDuration, lastValidStart, dragDirection } =
        interaction.current;

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;

          if (type === "move") {
            const proposed = originalStart + delta;
            const result = resolveMove(
              proposed,
              originalDuration,
              id,
              lastValidStart,
              dragDirection || (proposed > lastValidStart ? 1 : -1)
            );
            interaction.current!.lastValidStart = result.start;
            return { ...b, ...result };
          }

          // Resize: still block on overlap
          let candidateStart = originalStart;
          let candidateDuration = originalDuration;

          if (type === "resize-right") {
            candidateDuration = originalDuration + delta;
          } else if (type === "resize-left") {
            candidateStart = originalStart + delta;
            candidateDuration = originalStart + originalDuration - candidateStart;
          }

          const snappedStart = snap(Math.max(0, candidateStart));
          let snappedDur = snap(Math.max(15, candidateDuration));
          if (snappedStart + snappedDur > DAY) snappedDur = DAY - snappedStart;

          if (getOverlappingBlock(snappedStart, snappedDur, id)) {
            return b;
          }
          return { ...b, start: snappedStart, duration: snappedDur };
        })
      );
    },
    [blocks]
  );

  const onPointerUp = useCallback(() => {
    interaction.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Asteria</h1>

      <div className="flex gap-3 mb-6 flex-wrap items-end">
        <input
          className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Activity"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addBlock()}
        />

        <div className="flex flex-col">
          <label className="text-xs text-gray-600 mb-1">Start</label>
          <input
            type="time"
            className="border border-gray-300 p-2 rounded bg-white text-black cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={start}
            onChange={(e) => setStart(roundTimeTo5(e.target.value))}
            onClick={(e) => toggleTimePicker(e.currentTarget, startPickerOpen)}
            onBlur={() => {
              startPickerOpen.current = false;
            }}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600 mb-1">End</label>
          <input
            type="time"
            className="border border-gray-300 p-2 rounded bg-white text-black cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={end}
            onChange={(e) => setEnd(roundTimeTo5(e.target.value))}
            onClick={(e) => toggleTimePicker(e.currentTarget, endPickerOpen)}
            onBlur={() => {
              endPickerOpen.current = false;
            }}
          />
        </div>

        <button
          onClick={addBlock}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      <div
        ref={timelineRef}
        className="relative border rounded bg-gray-50 h-32 select-none touch-none overflow-hidden"
      >
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-gray-300 text-[10px] text-gray-500 pointer-events-none"
            style={{ left: `${(i / 24) * 100}%` }}
          >
            <span className={i === 24 ? "absolute right-0 pr-1" : "pl-0.5"}>
              {i}:00
            </span>
          </div>
        ))}

        {blocks.map((b) => {
          const widthPercent = (b.duration / DAY) * 100;
          const isNarrow = widthPercent < 12;

          return (
            <div
              key={b.id}
              className={`absolute top-7 bottom-2 ${b.color} text-white rounded text-xs flex items-center overflow-hidden whitespace-nowrap`}
              style={{
                left: `${(b.start / DAY) * 100}%`,
                width: `${widthPercent}%`,
              }}
              onPointerDown={(e) => onPointerDown(e, b, "move")}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-10"
                onPointerDown={(e) => onPointerDown(e, b, "resize-left")}
              />
              <span className="pl-5 pr-5 truncate pointer-events-none leading-tight text-left">
                {b.title}
                <br />
                {isNarrow ? (
                  <>
                    <span className="text-[10px] opacity-90 block">
                      {minutesToTime(b.start)}
                    </span>
                    <span className="text-[10px] opacity-90 block">
                      {minutesToTime(b.start + b.duration)}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] opacity-90">
                    {minutesToTime(b.start)} – {minutesToTime(b.start + b.duration)}
                  </span>
                )}
              </span>
              <div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-10"
                onPointerDown={(e) => onPointerDown(e, b, "resize-right")}
              />
            </div>
          );
        })}
      </div>

      <p className="text-sm text-gray-500 mt-2">
        Drag into a block to jump to the other side · Resizing still stops at edges
      </p>
    </div>
  );
}
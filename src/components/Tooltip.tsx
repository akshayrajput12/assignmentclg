"use client";

import React, { useState } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-2.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-2.5",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-1 border-t-white",
    bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-white",
    left: "left-full top-1/2 -translate-y-1/2 -ml-1 border-l-white",
    right: "right-full top-1/2 -translate-y-1/2 -mr-1 border-r-white",
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-[100] w-64 p-3 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-xl text-[11px] font-sans font-medium text-slate-500 leading-normal animate-fade-in-up ${positionClasses[position]}`}
        >
          {content}
          <div
            className={`absolute border-4 border-transparent ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  );
}

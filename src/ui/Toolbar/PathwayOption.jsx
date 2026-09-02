import React, { useState, useRef, useEffect } from "react";
import { Square, Triangle, LineSquiggle, Circle, BrickWallFire, ChevronsUp, SquareChevronDown, SeparatorVertical, SeparatorHorizontal, ArrowDownFromLine } from "lucide-react";

export default function PathwayOption({ label, icon: Icon, onSelectComponent, isActive }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const shapes = [
    { name: "Conduit", icon: SeparatorVertical },
    { name: "Riser", icon: SeparatorHorizontal },
    { name: "Underground Conduit", icon: ArrowDownFromLine }
  ];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="dropdown-container" ref={dropdownRef}>
      <button
        className={`toolbar-btn ${isActive ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {Icon && <Icon size={16} />}
        {label}
      </button>

      {open && (
        <div className="dropdown-panel">
          <div className="dropdown-header">Components</div>
          {shapes.map(({ name, icon: ShapeIcon }) => (
            <button
              key={name}
              className="dropdown-item"
              onClick={() => {
                onSelectComponent(name);
                setOpen(false);
              }}
            >
              <ShapeIcon size={16} strokeWidth={1.5} />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
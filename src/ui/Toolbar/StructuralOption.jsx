import React, { useState, useRef, useEffect } from "react";
import { Square, Triangle, LineSquiggle, Circle } from "lucide-react";

export default function StructuralOption({ label, icon: Icon, onSelectShape, isActive }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const shapes = [
    { name: "Rectangle", icon: Square },
    { name: "Polygon", icon: Triangle },
    { name: "Circular", icon: Circle }
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
          <div className="dropdown-header">Structure</div>
          {shapes.map(({ name, icon: ShapeIcon }) => (
            <button
              key={name}
              className="dropdown-item"
              onClick={() => {
                onSelectShape(name);
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
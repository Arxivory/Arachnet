import React, { useState, useRef, useEffect } from "react";

export default function Topbar() {

  const [openMenu, setOpenMenu] = useState(null);
  const topbarRef = useRef(null);

  const menuItems = {
    File: ["New Project", "Open...", "Save", "Export"],
    Edit: ["Undo", "Redo", "Cut", "Copy", "Paste"],
    View: ["Zoom In", "Zoom Out", "Reset View", "Toggle Grid"],
    Tools: ["Measure", "Calculate", "Settings"]
  };
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topbarRef.current && !topbarRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleMenu = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  return (
    <div className="topbar-container" ref={topbarRef}>
      <div className="topbar-group">
        {Object.keys(menuItems).map((menu) => (
          <div key={menu} className="dropdown-container">
            <button
              className={`topbar-button ${openMenu === menu ? "active" : ""}`}
              onClick={() => toggleMenu(menu)}
            >
              {menu}
            </button>

            {openMenu === menu && (
              <div className="dropdown-panel topbar-dropdown">
                {menuItems[menu].map((item) => (
                  <button
                    key={item}
                    className="dropdown-item"
                    onClick={() => {
                      console.log(`${item} clicked`);
                      setOpenMenu(null);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
import React from "react";

const SwitchPanel = ({ activeTab, setActiveTab }) => {
  return (
    <div className="switch-panel">
      <button
        onClick={() => setActiveTab("console")}
        className={`switch-btn ${activeTab === "console" ? "active" : ""}`}
      >
        Console
      </button>

      <button
        onClick={() => setActiveTab("simulation")}
        className={`switch-btn ${activeTab === "simulation" ? "active" : ""}`}
      >
        Simulation
      </button>

      <button
        className="switch-btn"
      >
        Digital Twin
      </button>
    </div>
  );
};

export default SwitchPanel;
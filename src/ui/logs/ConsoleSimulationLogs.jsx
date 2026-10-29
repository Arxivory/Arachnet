import { useState, useEffect } from "react";
import ConsolePanel from "./ConsolePanel";
import SimulationPanel from "./SimulationPanel"; 
import SwitchPanel from "./SwitchPanel";

export default function ConsoleSimulationLogs() {
  const [activeTab, setActiveTab] = useState("console");

  // ── Lifted log state — survives tab switches ───────────────────────────────
  const [logData, setLogData] = useState([]);
  const [simulationLogData, setSimulationLogData] = useState([]);

  useEffect(() => {
    const handleNewLog = (event) => {
      const { category, device, deviceName, message, location } = event.detail;
      const now = new Date();

      const newEntry = {
        id:         now.getTime() + Math.random(),
        device:     device     || "System",
        deviceName: deviceName || "Unknown Device",
        message:    message    || "No message provided",
        time:       now.toLocaleTimeString([], {
                      hour:   "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }),
        date:       now.toLocaleDateString("en-GB"),
        location:   location || "Unspecified",
      };

      if (category === "simulation") {
        setSimulationLogData((prev) => [newEntry, ...prev]);
      } else {
        setLogData((prev) => [newEntry, ...prev]);
      }
    };

    window.addEventListener("add-system-log", handleNewLog);
    return () => window.removeEventListener("add-system-log", handleNewLog);
  }, []);

  return (
    <div className="console-simulation-logs">
      <SwitchPanel activeTab={activeTab} setActiveTab={setActiveTab} />
     
      <div className="panel"> 
        {activeTab === "console"
          ? <ConsolePanel logData={logData} setLogData={setLogData} />
          : <SimulationPanel logData={simulationLogData} setLogData={setSimulationLogData} />}
      </div>
    </div>
  );
}
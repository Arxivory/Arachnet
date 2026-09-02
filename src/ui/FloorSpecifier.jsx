
import { useState } from "react";
import { useHierarchy } from "./HierarchyContext";
import { AddVirtualFloorCommand } from "../core/editor/DrawingCommands";
import appState from "../state/AppState";

export default function FloorSpecifier({ parentId, onCloseModal, floorCount }) {
    const [count, setCount] = useState(1);
    const { addNode } = useHierarchy();

    const handleAdd = () => {
            const n = parseInt(count, 10);
            if (isNaN(n) || n <= 0) return;

            for (let i = 0; i < n; i++) {
                // 2. Prepare the raw data payload for the virtual floor
                const floorData = {
                    siteId: parentId,
                    label: `Floor ${floorCount + i}`
                };

                // 3. Create the command, execute it, and log it in the Time Machine!
                const command = new AddVirtualFloorCommand(appState, floorData);
                command.execute(); // Actually builds the floor and updates the UI
                appState.pushCommand(command); // Saves it to the Undo stack
            }
            
            setCount(1);
        };

    return (
        <div className="floor-specifier-container">
            <h2 className="floor-specifier-label">Add Floors</h2>
            <hr className="horizontal-separator" />
            <div className="floor-specifier-input-wrapper">
                <p className="floor-specifier-number-label">Number of Floors:</p>
                <input
                    className="floor-specifier-input"
                    type="number"
                    value={count}
                    min={1}
                    onChange={(e) => setCount(e.target.value)}
                />
            </div>
            <button className="floor-specifier-btn" onClick={() => {handleAdd(); onCloseModal();}}>
                Add
            </button>
        </div>
    );
}
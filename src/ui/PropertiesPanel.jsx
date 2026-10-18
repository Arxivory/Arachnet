export default function PropertiesPanel() {
  return (
    <div className="properties-panel">
      <h3>Properties</h3>
      <hr className="header-separator" />
      <div className="properties-group">
        <button className="floor-specifier-btn">
            Configure Device
        </button>
      </div>
      <hr className="header-separator" />
      <h3>Transformations</h3>
        <>
          <div className="transform-header"><span></span><span>X</span><span>Y</span><span>Z</span></div>
          <div className="transform-grid">
            <label>Position</label>
            <input type="number" className="field-input"/>
            <input type="number" className="field-input" />
            <input type="number" className="field-input" />
          </div>
          <div className="transform-grid">
            <label>Scale</label>
            <input type="number" className="field-input"/>
            <input type="number" className="field-input"/>
            <input type="number" className="field-input"/>
          </div>
          <div className="transform-grid">
            <label>Rotation</label>
            <input type="number" className="field-input"/>
            <input type="number" className="field-input"/>
            <input type="number" className="field-input"/>
          </div>
        </>
    </div>
  );
}
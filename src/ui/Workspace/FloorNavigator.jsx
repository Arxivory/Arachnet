export default function FloorNavigator({ floors, activeFloorId, onSelect }) {
  return (
    <nav className="floor-navigator" aria-label="Floor navigator">
      {floors.map((floor, index) => (
        <button
          key={floor.id}
          type="button"
          className={`floor-nav-item${floor.id === activeFloorId ? " active" : ""}`}
          aria-label={floor.label}
          aria-current={floor.id === activeFloorId ? "true" : undefined}
          title={floor.label}
          onClick={() => onSelect(floor.id)}
        >
          {index + 1}
        </button>
      ))}
    </nav>
  );
}

import { useHierarchy } from "./HierarchyContext";
import TreeItem from "./TreeItem";

export default function HierarchyPanel() {
  const { hierarchy } = useHierarchy();

  return (
    <div className="hierarchy-panel">
      <h3 className="panel-header">
        Hierarchy
      </h3>
      <hr className="header-separator"/>
      <div className="panel-content">
        {hierarchy.map((node) => (
          <TreeItem key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

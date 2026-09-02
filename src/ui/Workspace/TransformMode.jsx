import React from 'react'
import { Move3D, Scale3D, Rotate3D } from 'lucide-react'

const TransformMode = ({mode, controllerRef}) => {
  return (
    <div className="mode-transform-panel">
        <button className="mode-transform-button px-3 py-1 mr-2 rounded"
            onClick={() => {
                mode.current = 'translate';
                controllerRef.current?.setGizmoTransformMode(mode.current);
            }}
        >
            <Move3D strokeWidth={1.5}/>
        </button>
        <button className="mode-transform-button px-3 py-1 rounded"
            onClick={() => {
                mode.current = 'scale';
                controllerRef.current?.setGizmoTransformMode(mode.current);
            }}
        >
            <Scale3D strokeWidth={1.5}/>
        </button>
        <button className="mode-transform-button px-3 py-1 rounded"
            onClick={() => {
                mode.current = 'rotate';
                controllerRef.current?.setGizmoTransformMode(mode.current);
            }}
        >
            <Rotate3D strokeWidth={1.5}/>
        </button>
    </div>
  )
}

export default TransformMode
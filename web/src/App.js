import React, { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadString, listAll, getDownloadURL } from "firebase/storage";
import { ReactSketchCanvas } from "react-sketch-canvas";

const firebaseConfig = {
  apiKey: "AIzaSyCMqj-eHi1t3Hok4iE3L5rFuboTg5U8m-I",
  authDomain: "try1-7d848.firebaseapp.com",
  projectId: "try1-7d848",
  storageBucket: "try1-7d848.firebasestorage.app",
  messagingSenderId: "632927777196",
  appId: "1:632927777196:web:2c6699ba7558db3e5b8a09",
  measurementId: "G-3RQY7NEMM4",
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

mermaid.initialize({ startOnLoad: false });

export default function App() {
  const [text, setText] = useState("");
  const [diagram, setDiagram] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedDiagrams, setSavedDiagrams] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [iterationHistory, setIterationHistory] = useState([]);
  const [currentIteration, setCurrentIteration] = useState(0);

  const [steps, setSteps] = useState([]); // {id,label,type}
  const [connections, setConnections] = useState([]); // {from,to}
  const [newStep, setNewStep] = useState({ label: "", type: "Process" });
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [nodePositions, setNodePositions] = useState(new Map()); // Track custom positions for dragging
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Track offset from mouse to node position
  const [zoom, setZoom] = useState(11.5); // Zoom level - default 1150%
  const [pan, setPan] = useState({ x: 0, y: 0 }); // Pan offset
  const [isPanning, setIsPanning] = useState(false); // Middle mouse button panning
  const [panStart, setPanStart] = useState({ x: 0, y: 0 }); // Pan start position
  const [nodeScale, setNodeScale] = useState(1); // Node size scale factor
  const [nodeSpacing, setNodeSpacing] = useState(0.5); // Node spacing multiplier for auto-arrange
  const [menuNode, setMenuNode] = useState(null); // Node with active menu
  const [editingNode, setEditingNode] = useState(null); // Node being edited
  const [editText, setEditText] = useState(""); // Temp text during edit
  const [nodeSubtext, setNodeSubtext] = useState(new Map()); // Subtext for nodes (array of strings)
  const menuHideTimeoutRef = React.useRef(null); // Timeout for hiding menu
  const [nodeSizes, setNodeSizes] = useState(new Map()); // Individual node sizes
  const [resizingNode, setResizingNode] = useState(null); // Node being resized
  const [resizeStart, setResizeStart] = useState({ x: 0, size: 1 }); // Resize start position
  const [diagramOffset, setDiagramOffset] = useState({ x: 0, y: 0 }); // Overall diagram position
  const [movingDiagram, setMovingDiagram] = useState(false); // Moving entire diagram
  const [moveStart, setMoveStart] = useState({ x: 0, y: 0 }); // Move start position
  const [subsetEditNode, setSubsetEditNode] = useState(null); // Node for subset editing
  const [subsetList, setSubsetList] = useState([]); // List of subset items
  const [currentSubsetInput, setCurrentSubsetInput] = useState(""); // Current input for new subset item
  const [hoverMoveHandle, setHoverMoveHandle] = useState(false); // Hover state for move handle
  const [nodeMetadata, setNodeMetadata] = useState(new Map()); // Additional node info: Map<nodeId, {fieldName: {value, type}}>
  const [metadataEditNode, setMetadataEditNode] = useState(null); // Node for metadata editing
  const [metadataFields, setMetadataFields] = useState([]); // [{name, value, type}]

  // Annotation/Freestyle drawing with react-sketch-canvas + shapes overlay
  const sketchCanvasRef = useRef(null);
  const shapeCanvasRef = useRef(null);
  const textInputRef = useRef(null);
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [textFontSize, setTextFontSize] = useState(20);
  const [eraseMode, setEraseMode] = useState(false);
  const [drawMode, setDrawMode] = useState('pen'); // 'pen'|'line'|'arrow'|'rectangle'|'circle'|'roundedRect'|'text'|'curvedLine'|'select'
  const [shapes, setShapes] = useState([]);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [shapeStart, setShapeStart] = useState(null);
  const [currentMousePos, setCurrentMousePos] = useState(null);
  const [editingText, setEditingText] = useState(null); // {shapeId, text}
  const [selectedShape, setSelectedShape] = useState(null); // For editing curved lines
  const [draggingControlPoint, setDraggingControlPoint] = useState(null); // {shapeId}
  const [draggingShape, setDraggingShape] = useState(null); // {shapeId, offsetX, offsetY}
  const [resizingShape, setResizingShape] = useState(null); // {shapeId, handle: 'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'}
  const [resizeCursor, setResizeCursor] = useState('default');
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const [selectedNodesForConnection, setSelectedNodesForConnection] = useState([]);
  const [savedAnnotations, setSavedAnnotations] = useState([]);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [annotationSaveName, setAnnotationSaveName] = useState('');

  // Menu hover handlers with delay
  const showMenu = (nodeId) => {
    if (menuHideTimeoutRef.current) {
      clearTimeout(menuHideTimeoutRef.current);
      menuHideTimeoutRef.current = null;
    }
    setHoveredNode(nodeId);
    setMenuNode(nodeId);
  };

  const hideMenuWithDelay = () => {
    menuHideTimeoutRef.current = setTimeout(() => {
      setHoveredNode(null);
      setMenuNode(null);
    }, 300); // 300ms delay
  };

  const cancelHideMenu = () => {
    if (menuHideTimeoutRef.current) {
      clearTimeout(menuHideTimeoutRef.current);
      menuHideTimeoutRef.current = null;
    }
  };

  // Add wheel event listener with passive: false to prevent scroll
  useEffect(() => {
    const svg = document.querySelector("svg[data-flow-diagram]");
    if (!svg) return;

    const handleWheelEvent = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prevZoom => Math.max(0.02, Math.min(20, prevZoom * delta)));
    };

    svg.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      svg.removeEventListener("wheel", handleWheelEvent);
    };
  }, []);

  // Load Google Font for handwritten style
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  const handleDelete = (nodeId) => {
    setSteps(steps.filter((s) => s.id !== nodeId));
    setConnections(connections.filter((c) => c.from !== nodeId && c.to !== nodeId));
    setSelectedNode(null);
    setNodePositions((prev) => { const m = new Map(prev); m.delete(nodeId); return m; });
    setNodeSubtext((prev) => { const m = new Map(prev); m.delete(nodeId); return m; });
    setNodeMetadata((prev) => { const m = new Map(prev); m.delete(nodeId); return m; });
    setMenuNode(null);
  };

  const handleEditStart = (nodeId, currentLabel) => {
    setEditingNode(nodeId);
    setEditText(currentLabel);
    setMenuNode(null);
  };

  const handleEditSave = () => {
    if (editingNode && editText.trim()) {
      setSteps(steps.map(s => s.id === editingNode ? { ...s, label: editText } : s));
    }
    setEditingNode(null);
    setEditText("");
  };

  const handleAddSubset = (nodeId) => {
    setSubsetEditNode(nodeId);
    setSubsetList(nodeSubtext.get(nodeId) || []);
    setCurrentSubsetInput("");
    setMenuNode(null);
  };

  const handleSubsetAddItem = () => {
    if (currentSubsetInput.trim()) {
      setSubsetList([...subsetList, currentSubsetInput.trim()]);
      setCurrentSubsetInput("");
    }
  };

  const handleSubsetRemoveItem = (index) => {
    setSubsetList(subsetList.filter((_, i) => i !== index));
  };

  const handleSubsetSave = () => {
    if (subsetEditNode) {
      if (subsetList.length > 0) {
        setNodeSubtext((prev) => new Map(prev).set(subsetEditNode, subsetList));
      } else {
        setNodeSubtext((prev) => {
          const m = new Map(prev);
          m.delete(subsetEditNode);
          return m;
        });
      }
    }
    setSubsetEditNode(null);
    setSubsetList([]);
    setCurrentSubsetInput("");
  };

  const handleAddMetadata = (nodeId) => {
    setMetadataEditNode(nodeId);
    const existing = nodeMetadata.get(nodeId) || {};
    setMetadataFields(Object.entries(existing).map(([name, data]) => ({ 
      name, 
      value: data.value, 
      type: data.type 
    })));
    setMenuNode(null);
  };

  const handleMetadataSave = () => {
    if (metadataEditNode) {
      const metadata = {};
      metadataFields.forEach(field => {
        if (field.name && field.name.trim()) {
          metadata[field.name.trim()] = {
            value: field.value,
            type: field.type
          };
        }
      });
      setNodeMetadata((prev) => new Map(prev).set(metadataEditNode, metadata));
    }
    setMetadataEditNode(null);
    setMetadataFields([]);
  };

  // ========== SHAPE DRAWING HANDLERS ==========

  const getScaledCoords = (e) => {
    const canvas = shapeCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Detect which resize handle is under cursor
  const getResizeHandle = (shape, x, y) => {
    if (shape.type === 'text' || shape.type === 'curvedLine') return null;
    
    const minX = Math.min(shape.x1, shape.x2);
    const maxX = Math.max(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxY = Math.max(shape.y1, shape.y2);
    const handleSize = 10;
    
    // Corner handles
    if (Math.abs(x - minX) < handleSize && Math.abs(y - minY) < handleSize) return 'nw';
    if (Math.abs(x - maxX) < handleSize && Math.abs(y - minY) < handleSize) return 'ne';
    if (Math.abs(x - minX) < handleSize && Math.abs(y - maxY) < handleSize) return 'sw';
    if (Math.abs(x - maxX) < handleSize && Math.abs(y - maxY) < handleSize) return 'se';
    
    // Edge handles
    if (Math.abs(y - minY) < handleSize && x > minX + handleSize && x < maxX - handleSize) return 'n';
    if (Math.abs(y - maxY) < handleSize && x > minX + handleSize && x < maxX - handleSize) return 's';
    if (Math.abs(x - minX) < handleSize && y > minY + handleSize && y < maxY - handleSize) return 'w';
    if (Math.abs(x - maxX) < handleSize && y > minY + handleSize && y < maxY - handleSize) return 'e';
    
    return null;
  };

  const handleShapeDoubleClick = (e) => {
    if (drawMode !== 'select') return;
    
    const { x, y } = getScaledCoords(e);
    
    // Find if double-clicking on a text shape
    const clickedText = [...shapes].reverse().find(s => {
      if (s.type === 'text') {
        const ctx = shapeCanvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.font = `${s.fontSize || 20}px 'Caveat', 'Comic Sans MS', cursive, sans-serif`;
          ctx.textBaseline = 'top';
          const lines = (s.text || 'Click to edit...').split('\n');
          const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
          const textHeight = lines.length * (s.fontSize || 20) * 1.2;
          ctx.textBaseline = 'alphabetic';
          return x >= s.x - 5 && x <= s.x + maxWidth + 5 && 
                 y >= s.y - 5 && y <= s.y + textHeight + 5;
        }
      }
      return false;
    });
    
    if (clickedText) {
      // Enable editing mode for this text
      setEditingText({ shapeId: clickedText.id, text: clickedText.text || '' });
      setSelectedShape(clickedText.id);
    }
  };

  const handleShapeMouseDown = (e) => {
    if (drawMode === 'pen' || eraseMode) return;
    
    const { x, y } = getScaledCoords(e);
    
    // Check if clicking on a control point of a curved line
    const clickedCurve = shapes.find(s => 
      s.type === 'curvedLine' && 
      Math.hypot(s.controlX - x, s.controlY - y) < 15
    );
    
    if (clickedCurve) {
      setDraggingControlPoint(clickedCurve.id);
      setSelectedShape(clickedCurve.id);
      return;
    }
    
    // Select mode - click to select and drag shapes
    if (drawMode === 'select') {
      // Don't allow selection if currently editing text
      if (editingText) return;
      
      // Check if clicking on resize handle of selected shape
      if (selectedShape) {
        const selected = shapes.find(s => s.id === selectedShape);
        if (selected) {
          const handle = getResizeHandle(selected, x, y);
          if (handle) {
            setResizingShape({ shapeId: selected.id, handle: handle });
            return;
          }
        }
      }
      
      // Find shape under cursor (check in reverse order - top to bottom)
      const clickedShape = [...shapes].reverse().find(s => {
        if (s.type === 'text') {
          const ctx = shapeCanvasRef.current?.getContext('2d');
          if (ctx) {
            ctx.font = `${s.fontSize || 20}px 'Caveat', 'Comic Sans MS', cursive, sans-serif`;
            ctx.textBaseline = 'top';
            const lines = (s.text || 'Click to edit...').split('\n');
            const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
            const textHeight = lines.length * (s.fontSize || 20) * 1.2;
            ctx.textBaseline = 'alphabetic';
            return x >= s.x - 5 && x <= s.x + maxWidth + 5 && 
                   y >= s.y - 5 && y <= s.y + textHeight + 5;
          }
        } else if (s.type === 'curvedLine') {
          // Check if near the curve path
          const dist1 = Math.hypot(s.x1 - x, s.y1 - y);
          const dist2 = Math.hypot(s.x2 - x, s.y2 - y);
          return dist1 < 20 || dist2 < 20;
        } else {
          // Check bounding box for other shapes
          const minX = Math.min(s.x1, s.x2);
          const maxX = Math.max(s.x1, s.x2);
          const minY = Math.min(s.y1, s.y2);
          const maxY = Math.max(s.y1, s.y2);
          return x >= minX - 10 && x <= maxX + 10 && y >= minY - 10 && y <= maxY + 10;
        }
        return false;
      });
      
      if (clickedShape) {
        setSelectedShape(clickedShape.id);
        if (clickedShape.type === 'text') {
          setDraggingShape({ shapeId: clickedShape.id, offsetX: x - clickedShape.x, offsetY: y - clickedShape.y });
        } else {
          setDraggingShape({ shapeId: clickedShape.id, offsetX: x - clickedShape.x1, offsetY: y - clickedShape.y1 });
        }
      } else {
        setSelectedShape(null);
      }
      return;
    }
    
    // Text mode - create text annotation
    if (drawMode === 'text') {
      const newShape = {
        id: Date.now(),
        type: 'text',
        x: x,
        y: y,
        text: '',
        color: drawColor || '#000000',
        fontSize: textFontSize
      };
      setShapes(prev => [...prev, newShape]);
      setEditingText({ shapeId: newShape.id, text: '' });
      // Don't switch to select mode yet - wait until text editing is done
      return;
    }
    
    // Curved line mode - needs control point
    if (drawMode === 'curvedLine') {
      setShapeStart({ x, y });
      setIsDrawingShape(true);
      return;
    }
    
    setShapeStart({ x, y });
    setIsDrawingShape(true);
  };

  const handleShapeMouseMove = (e) => {
    const { x, y } = getScaledCoords(e);
    
    // If dragging a control point
    if (draggingControlPoint) {
      setShapes(prev => prev.map(s => 
        s.id === draggingControlPoint 
          ? {...s, controlX: x, controlY: y}
          : s
      ));
      return;
    }
    
    // If resizing a shape
    if (resizingShape) {
      setShapes(prev => prev.map(s => {
        if (s.id === resizingShape.shapeId) {
          const handle = resizingShape.handle;
          let newShape = {...s};
          
          // Update coordinates based on which handle is being dragged
          if (handle.includes('n')) newShape.y1 = Math.min(newShape.y1, newShape.y2) === newShape.y1 ? y : newShape.y1;
          if (handle.includes('s')) newShape.y2 = Math.max(newShape.y1, newShape.y2) === newShape.y2 ? y : newShape.y2;
          if (handle.includes('w')) newShape.x1 = Math.min(newShape.x1, newShape.x2) === newShape.x1 ? x : newShape.x1;
          if (handle.includes('e')) newShape.x2 = Math.max(newShape.x1, newShape.x2) === newShape.x2 ? x : newShape.x2;
          
          // Single edge handles
          if (handle === 'n') newShape.y1 = y;
          if (handle === 's') newShape.y2 = y;
          if (handle === 'w') newShape.x1 = x;
          if (handle === 'e') newShape.x2 = x;
          
          return newShape;
        }
        return s;
      }));
      return;
    }
    
    // If dragging a shape to move it
    if (draggingShape) {
      setShapes(prev => prev.map(s => {
        if (s.id === draggingShape.shapeId) {
          if (s.type === 'text') {
            return {...s, x: x - draggingShape.offsetX, y: y - draggingShape.offsetY};
          } else {
            const deltaX = x - draggingShape.offsetX - s.x1;
            const deltaY = y - draggingShape.offsetY - s.y1;
            const newShape = {
              ...s,
              x1: s.x1 + deltaX,
              y1: s.y1 + deltaY,
              x2: s.x2 + deltaX,
              y2: s.y2 + deltaY
            };
            if (s.controlX !== undefined) {
              newShape.controlX = s.controlX + deltaX;
              newShape.controlY = s.controlY + deltaY;
            }
            return newShape;
          }
        }
        return s;
      }));
      return;
    }
    
    // Update cursor based on hover over resize handles
    if (drawMode === 'select' && selectedShape && !isDrawingShape) {
      const selected = shapes.find(s => s.id === selectedShape);
      if (selected) {
        const handle = getResizeHandle(selected, x, y);
        if (handle) {
          const cursorMap = {
            'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
            'n': 'n-resize', 's': 's-resize', 'w': 'w-resize', 'e': 'e-resize'
          };
          setResizeCursor(cursorMap[handle]);
        } else {
          setResizeCursor('move');
        }
      } else {
        setResizeCursor('default');
      }
    }
    
    if (!isDrawingShape || drawMode === 'pen') return;
    setCurrentMousePos({ x, y });
  };

  const handleShapeMouseUp = (e) => {
    // If was dragging a control point
    if (draggingControlPoint) {
      setDraggingControlPoint(null);
      return;
    }
    
    // If was resizing a shape
    if (resizingShape) {
      setResizingShape(null);
      return;
    }
    
    // If was dragging a shape
    if (draggingShape) {
      setDraggingShape(null);
      return;
    }
    
    if (!isDrawingShape || drawMode === 'pen' || drawMode === 'text' || drawMode === 'select') return;
    
    const { x, y } = getScaledCoords(e);
    
    const newShape = {
      id: Date.now(),
      type: drawMode,
      x1: shapeStart.x,
      y1: shapeStart.y,
      x2: x,
      y2: y,
      color: drawColor,
      strokeWidth: strokeWidth
    };
    
    // For curved lines, add control point in the middle
    if (drawMode === 'curvedLine') {
      const midX = (shapeStart.x + x) / 2;
      const midY = (shapeStart.y + y) / 2;
      newShape.controlX = midX;
      newShape.controlY = midY - 50; // Offset control point upward
    }
    
    setShapes(prev => [...prev, newShape]);
    setIsDrawingShape(false);
    setShapeStart(null);
    setCurrentMousePos(null);
    
    // Auto-switch to select mode after drawing
    setDrawMode('select');
    setSelectedShape(newShape.id);
  };

  // Handle keyboard events for deleting selected shapes
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only delete if not editing text
      if (editingText) return;
      
      // Delete or Backspace key pressed and a shape is selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        e.preventDefault();
        setShapes(prev => prev.filter(s => s.id !== selectedShape));
        setSelectedShape(null);
      }
      
      // Enter key pressed with 2 nodes selected - create connection
      if (e.key === 'Enter' && selectedNodesForConnection.length === 2) {
        e.preventDefault();
        const [fromNode, toNode] = selectedNodesForConnection;
        // Check if connection already exists
        const connectionExists = connections.some(
          c => (c.from === fromNode && c.to === toNode) || (c.from === toNode && c.to === fromNode)
        );
        if (!connectionExists) {
          setConnections(prev => [...prev, { from: fromNode, to: toNode, label: '' }]);
        }
        setSelectedNodesForConnection([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedShape, editingText, selectedNodesForConnection, connections]);

  // Draw shapes on canvas
  useEffect(() => {
    const canvas = shapeCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all saved shapes
    shapes.forEach(shape => {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (shape.type === 'text') {
        // Draw text with handwritten font - no box, just text
        ctx.font = `${shape.fontSize || 20}px 'Caveat', 'Comic Sans MS', cursive, sans-serif`;
        ctx.fillStyle = shape.color || '#000000';
        ctx.textBaseline = 'top';
        
        // Draw the text if it exists
        if (shape.text && shape.text.trim()) {
          // Split by newlines for multi-line text
          const lines = shape.text.split('\n');
          lines.forEach((line, index) => {
            ctx.fillText(line, shape.x, shape.y + (index * (shape.fontSize || 20) * 1.2));
          });
        } else if (!editingText || editingText.shapeId !== shape.id) {
          // Show subtle placeholder when empty and not editing
          ctx.fillStyle = '#d1d5db';
          ctx.fillText('Click to edit...', shape.x, shape.y);
        }
        
        ctx.textBaseline = 'alphabetic';
      } else if (shape.type === 'curvedLine') {
        // Draw curved line with quadratic bezier
        ctx.beginPath();
        ctx.moveTo(shape.x1, shape.y1);
        ctx.quadraticCurveTo(shape.controlX, shape.controlY, shape.x2, shape.y2);
        ctx.stroke();
        
        // Draw control point node
        if (selectedShape === shape.id) {
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(shape.controlX, shape.controlY, 6, 0, 2 * Math.PI);
          ctx.fill();
          // Draw lines to control point
          ctx.strokeStyle = '#93c5fd';
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(shape.x1, shape.y1);
          ctx.lineTo(shape.controlX, shape.controlY);
          ctx.lineTo(shape.x2, shape.y2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        const x1 = shape.x1;
        const y1 = shape.y1;
        const x2 = shape.x2;
        const y2 = shape.y2;
        
        if (shape.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (shape.type === 'arrow') {
          // Draw line
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          
          // Draw arrowhead
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headlen = 15;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 7), y2 - headlen * Math.sin(angle - Math.PI / 7));
          ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 7), y2 - headlen * Math.sin(angle + Math.PI / 7));
          ctx.closePath();
          ctx.fill();
        } else if (shape.type === 'rectangle') {
          const width = x2 - x1;
          const height = y2 - y1;
          ctx.strokeRect(x1, y1, width, height);
        } else if (shape.type === 'roundedRect') {
          const width = x2 - x1;
          const height = y2 - y1;
          const radius = Math.min(Math.abs(width), Math.abs(height)) / 8;
          ctx.beginPath();
          ctx.roundRect(x1, y1, width, height, radius);
          ctx.stroke();
        } else if (shape.type === 'circle') {
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          const radiusX = Math.abs(x2 - x1) / 2;
          const radiusY = Math.abs(y2 - y1) / 2;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    });
    
    // Draw selection indicator for selected shape (except curved lines which already show control point)
    if (selectedShape && drawMode === 'select') {
      const selected = shapes.find(s => s.id === selectedShape);
      if (selected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        
        if (selected.type === 'text') {
          // For text, just show a simple cursor indicator - no box
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(selected.x - 2, selected.y - 2, 4, selected.fontSize + 4);
        } else if (selected.type !== 'curvedLine') {
          const minX = Math.min(selected.x1, selected.x2);
          const maxX = Math.max(selected.x1, selected.x2);
          const minY = Math.min(selected.y1, selected.y2);
          const maxY = Math.max(selected.y1, selected.y2);
          ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
          
          // Draw resize handles (small squares at corners and edges)
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          const handleSize = 8;
          
          // Corner handles
          [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]].forEach(([hx, hy]) => {
            ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
          });
          
          // Edge handles
          const midX = (minX + maxX) / 2;
          const midY = (minY + maxY) / 2;
          [[midX, minY], [midX, maxY], [minX, midY], [maxX, midY]].forEach(([hx, hy]) => {
            ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
          });
        }
        
        ctx.setLineDash([]);
      }
    }
    
    // Draw preview of current shape
    if (isDrawingShape && shapeStart && currentMousePos && drawMode !== 'pen') {
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = strokeWidth;
      ctx.globalAlpha = 0.5;
      
      const x1 = shapeStart.x;
      const y1 = shapeStart.y;
      const x2 = currentMousePos.x;
      const y2 = currentMousePos.y;
      
      if (drawMode === 'line') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (drawMode === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headlen = 15;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 7), y2 - headlen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 7), y2 - headlen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      } else if (drawMode === 'rectangle') {
        const width = x2 - x1;
        const height = y2 - y1;
        ctx.strokeRect(x1, y1, width, height);
      } else if (drawMode === 'roundedRect') {
        const width = x2 - x1;
        const height = y2 - y1;
        const radius = Math.min(Math.abs(width), Math.abs(height)) / 8;
        ctx.beginPath();
        ctx.roundRect(x1, y1, width, height, radius);
        ctx.stroke();
      } else if (drawMode === 'circle') {
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (drawMode === 'curvedLine') {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 50;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1.0;
    }
  }, [shapes, isDrawingShape, shapeStart, currentMousePos, drawMode, drawColor, strokeWidth, editingText, selectedShape]);

  // ========== ANNOTATION SAVE/LOAD WITH REACT-SKETCH-CANVAS ==========

  const saveAnnotations = async () => {
    if (!annotationSaveName.trim()) {
      alert('Please enter a name for the drawing');
      return;
    }
    try {
      if (!sketchCanvasRef.current) return;
      
      const paths = await sketchCanvasRef.current.exportPaths();
      const annotationData = {
        name: annotationSaveName,
        timestamp: Date.now(),
        paths: paths,
        shapes: shapes
      };
      const storageRef = ref(storage, `annotations/${annotationSaveName}-${Date.now()}.json`);
      await uploadString(storageRef, JSON.stringify(annotationData));
      alert('Drawing saved successfully!');
      setAnnotationSaveName('');
      setShowAnnotationModal(false);
      loadSavedAnnotations();
    } catch (err) {
      console.error('Error saving drawing:', err);
      alert('Failed to save drawing');
    }
  };

  const loadSavedAnnotations = async () => {
    try {
      const listRef = ref(storage, 'annotations/');
      const res = await listAll(listRef);
      const annotations = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const response = await fetch(url);
          const data = await response.json();
          return { ...data, ref: itemRef.fullPath };
        })
      );
      setSavedAnnotations(annotations.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      console.error('Error loading drawings:', err);
    }
  };

  const loadAnnotation = (annotation) => {
    if (sketchCanvasRef.current && annotation.paths) {
      sketchCanvasRef.current.loadPaths(annotation.paths);
    }
    if (annotation.shapes) {
      setShapes(annotation.shapes);
    }
    setShowAnnotationModal(false);
  };

  useEffect(() => {
    loadSavedAnnotations();
  }, []);

  const autoArrangeHorizontal = () => {
    if (steps.length === 0) return;

    // Build adjacency map
    const childrenMap = new Map();
    const parentsMap = new Map();
    steps.forEach(s => {
      childrenMap.set(s.id, []);
      parentsMap.set(s.id, []);
    });
    connections.forEach(c => {
      if (childrenMap.has(c.from)) childrenMap.get(c.from).push(c.to);
      if (parentsMap.has(c.to)) parentsMap.get(c.to).push(c.from);
    });

    // Find root nodes (no parents)
    const roots = steps.filter(s => parentsMap.get(s.id).length === 0).map(s => s.id);
    if (roots.length === 0) roots.push(steps[0].id); // Fallback to first node

    // Level-based layout (BFS)
    const levels = new Map();
    const visited = new Set();
    const queue = roots.map(id => ({ id, level: 0 }));

    while (queue.length > 0) {
      const { id, level } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(id);

      const children = childrenMap.get(id) || [];
      children.forEach(childId => {
        if (!visited.has(childId)) {
          queue.push({ id: childId, level: level + 1 });
        }
      });
    }

    // Add unvisited nodes to the end
    steps.forEach(s => {
      if (!visited.has(s.id)) {
        const lastLevel = Math.max(...levels.keys(), -1) + 1;
        if (!levels.has(lastLevel)) levels.set(lastLevel, []);
        levels.get(lastLevel).push(s.id);
      }
    });

    // Calculate positions
    const horizontalSpacing = 200 * nodeSpacing;
    const verticalSpacing = 100 * nodeSpacing;
    const newPositions = new Map();

    levels.forEach((nodeIds, level) => {
      nodeIds.forEach((id, index) => {
        const x = 100 + level * horizontalSpacing;
        const y = 100 + index * verticalSpacing;
        newPositions.set(id, { x, y });
      });
    });

    setNodePositions(newPositions);
  };

  const autoArrangeVertical = () => {
    if (steps.length === 0) return;

    // Build adjacency map
    const childrenMap = new Map();
    const parentsMap = new Map();
    steps.forEach(s => {
      childrenMap.set(s.id, []);
      parentsMap.set(s.id, []);
    });
    connections.forEach(c => {
      if (childrenMap.has(c.from)) childrenMap.get(c.from).push(c.to);
      if (parentsMap.has(c.to)) parentsMap.get(c.to).push(c.from);
    });

    // Find root nodes (no parents)
    const roots = steps.filter(s => parentsMap.get(s.id).length === 0).map(s => s.id);
    if (roots.length === 0) roots.push(steps[0].id); // Fallback to first node

    // Level-based layout (BFS)
    const levels = new Map();
    const visited = new Set();
    const queue = roots.map(id => ({ id, level: 0 }));

    while (queue.length > 0) {
      const { id, level } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(id);

      const children = childrenMap.get(id) || [];
      children.forEach(childId => {
        if (!visited.has(childId)) {
          queue.push({ id: childId, level: level + 1 });
        }
      });
    }

    // Add unvisited nodes to the end
    steps.forEach(s => {
      if (!visited.has(s.id)) {
        const lastLevel = Math.max(...levels.keys(), -1) + 1;
        if (!levels.has(lastLevel)) levels.set(lastLevel, []);
        levels.get(lastLevel).push(s.id);
      }
    });

    // Calculate positions (vertical layout)
    const horizontalSpacing = 200 * nodeSpacing;
    const verticalSpacing = 100 * nodeSpacing;
    const newPositions = new Map();

    levels.forEach((nodeIds, level) => {
      nodeIds.forEach((id, index) => {
        const x = 100 + index * horizontalSpacing;
        const y = 100 + level * verticalSpacing;
        newPositions.set(id, { x, y });
      });
    });

    setNodePositions(newPositions);
  };

  // Parse Mermaid flowchart to extract nodes and edges
  const parseMermaid = (code) => {
    if (!code) return { nodes: [], edges: [] };
    const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const nodes = new Map();
    const edges = [];
    // Enhanced regex to capture all Mermaid shape brackets
    const nodeRegex = /(\w+)(\(\[.*?\]\)|\(\(.*?\)\)|\[\[.*?\]\]|\[\(.*?\)\]|\[\/.*?\/\]|\[\\.*?\\\]|\[\/.*?\\\]|>.*?\]|\{.*?\}|\[.*?\])/g;
    const typeFromBracket = (text) => {
      if (!text) return "Process";
      const t = text.trim();
      // Mermaid standard shapes - order matters!
      if (t.startsWith("([") && t.endsWith("])")) return "Terminator"; // Stadium/Pill shape
      if (t.startsWith("((") && t.endsWith("))")) return "Connector"; // Circle
      if (t.startsWith("[[") && t.endsWith("]]")) return "Predefined Process"; // Subroutine
      if (t.startsWith("[(") && t.endsWith(")]")) return "Data/Database"; // Cylindrical
      if (t.startsWith("[/") && t.endsWith("/]")) return "Input/Output"; // Parallelogram
      if (t.startsWith("[\\") && t.endsWith("\\]")) return "Manual Input"; // Trapezoid
      if (t.startsWith("[/") && t.endsWith("\\]")) return "Manual Input"; // Trapezoid alt
      if (t.startsWith(">") && t.endsWith("]")) return "Input/Output"; // Asymmetric
      if (t.startsWith("{") && t.endsWith("}")) return "Decision"; // Rhombus
      if (t.startsWith("[") && t.endsWith("]")) return "Process"; // Rectangle
      return "Process";
    };
    const labelFromBracket = (text) => {
      if (!text) return "";
      // Remove Mermaid shape brackets - order matters!
      let label = text.trim();
      if (label.startsWith("([") && label.endsWith("])")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("((") && label.endsWith("))")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("[[") && label.endsWith("]]")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("[(") && label.endsWith(")]")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("[/") && label.endsWith("/]")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("[\\") && label.endsWith("\\]")) {
        return label.slice(2, -2);
      }
      if (label.startsWith("[/") && label.endsWith("\\]")) {
        return label.slice(2, -2);
      }
      if (label.startsWith(">") && label.endsWith("]")) {
        return label.slice(1, -1);
      }
      if (label.startsWith("{") && label.endsWith("}")) {
        return label.slice(1, -1);
      }
      if (label.startsWith("[") && label.endsWith("]")) {
        return label.slice(1, -1);
      }
      return label;
    };
    // Extract all nodes (including from edge lines) and edges
    for (const l of lines) {
      // Extract nodes: ID[Label], ID{Label}, ID((Label)), ID[[Label]], ID/Label/
      let nodeMatch;
      while ((nodeMatch = nodeRegex.exec(l)) !== null) {
        const id = nodeMatch[1];
        const bracket = nodeMatch[2];
        if (!nodes.has(id)) {
          nodes.set(id, { id, label: labelFromBracket(bracket) || id, type: typeFromBracket(bracket) });
        }
      }
      // Extract edges: A --> B or A -> B or A -->|label| B
      // Match patterns like: A --> B, A -->|text| B, A -.->|text| B, A ==>|text| B
      const edgeMatches = l.match(/(\w+)\s*(-->|->|==>|==|\.\.>|\.-)\s*(\|[^|]+\|)?\s*(\w+)/g) || [];
      for (const edgeStr of edgeMatches) {
        const edgeMatch = edgeStr.match(/(\w+)\s*(-->|->|==>|==|\.\.>|\.-)\s*(\|[^|]+\|)?\s*(\w+)/);
        if (edgeMatch) {
          edges.push({ from: edgeMatch[1], to: edgeMatch[4] });
        }
      }
    }
    return { nodes: Array.from(nodes.values()), edges };
  };

  const shapeMap = {
    Terminator: "terminator",
    Process: "process",
    Decision: "decision",
    "Input/Output": "io",
    Document: "document",
    "Data/Database": "database",
    "Predefined Process": "subprocess",
    "Manual Input": "manual",
    Delay: "delay",
    Connector: "connector",
  };

  const renderFlowSVGReact = () => {
    const baseNodeWidth = 20 * nodeScale;
    const baseNodeHeight = 8 * nodeScale;
    const hGap = 8 * nodeScale;
    const vGap = 5 * nodeScale;
    
    // Helper to get individual node size
    const getNodeSize = (nodeId) => {
      const individualSize = nodeSizes.get(nodeId) || 1;
      return {
        width: baseNodeWidth * individualSize,
        height: baseNodeHeight * individualSize
      };
    };
    
    const nodeWidth = baseNodeWidth;
    const nodeHeight = baseNodeHeight;
    const cols = Math.max(1, Math.ceil(Math.sqrt(steps.length)));
    const positions = new Map();
    steps.forEach((s, i) => {
      const customPos = nodePositions.get(s.id);
      if (customPos) {
        positions.set(s.id, { x: customPos.x + diagramOffset.x, y: customPos.y + diagramOffset.y });
      } else {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.set(s.id, {
          x: 40 + col * (nodeWidth + hGap) + diagramOffset.x,
          y: 40 + row * (nodeHeight + vGap) + diagramOffset.y,
        });
      }
    });
    // Much larger canvas for navigation
    const canvasWidth = 3000;
    const canvasHeight = 2000;
    const width = canvasWidth;
    const height = canvasHeight;

    const handleDiagramMoveStart = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const svg = document.querySelector("svg[data-flow-diagram]");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      setMovingDiagram(true);
      setMoveStart({ x: mouseX - diagramOffset.x, y: mouseY - diagramOffset.y });
      setDraggedNode(null);
      setResizingNode(null);
    };

    const handleResizeStart = (e, nodeId) => {
      e.stopPropagation();
      e.preventDefault();
      const svg = document.querySelector("svg[data-flow-diagram]");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const currentSize = nodeSizes.get(nodeId) || 1;
      setResizingNode(nodeId);
      setResizeStart({ x: mouseX, size: currentSize });
      setDraggedNode(null);
    };

    const handleMouseDown = (e, nodeId) => {
      e.preventDefault();
      
      // Shift+click to select/deselect nodes for connection
      if (e.shiftKey) {
        setSelectedNodesForConnection(prev => {
          if (prev.includes(nodeId)) {
            // Deselect if already selected
            return prev.filter(id => id !== nodeId);
          } else if (prev.length < 2) {
            // Select if less than 2 nodes selected
            return [...prev, nodeId];
          } else {
            // Replace first selection if 2 already selected
            return [prev[1], nodeId];
          }
        });
        return;
      }
      
      const svg = document.querySelector("svg[data-flow-diagram]");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      
      // Get current node position
      const nodePos = positions.get(nodeId);
      if (!nodePos) return;
      
      // Calculate offset from mouse position to node's top-left corner
      setDragOffset({
        x: mouseX - nodePos.x,
        y: mouseY - nodePos.y
      });
      
      setDraggedNode(nodeId);
      setSelectedNode(nodeId);
    };

    const handleMouseMove = (e) => {
      if (movingDiagram) {
        const svg = document.querySelector("svg[data-flow-diagram]");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;
        setDiagramOffset({ x: mouseX - moveStart.x, y: mouseY - moveStart.y });
        return;
      }
      if (resizingNode) {
        const svg = document.querySelector("svg[data-flow-diagram]");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const deltaX = mouseX - resizeStart.x;
        const scaleFactor = 1 + (deltaX / (baseNodeWidth * 2));
        const newSize = Math.max(0.3, Math.min(3, resizeStart.size * scaleFactor));
        setNodeSizes((prev) => new Map(prev).set(resizingNode, newSize));
        return;
      }
      if (!draggedNode) return;
      const svg = document.querySelector("svg[data-flow-diagram]");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      
      // Apply the offset to maintain relative position
      const newX = mouseX - dragOffset.x;
      const newY = mouseY - dragOffset.y;
      
      // Allow movement with small padding (5px) from edges
      const minPadding = 5;
      const maxX = width - nodeWidth - minPadding;
      const maxY = height - nodeHeight - minPadding;
      setNodePositions((prev) => new Map(prev).set(draggedNode, { 
        x: Math.max(minPadding, Math.min(maxX, newX)), 
        y: Math.max(minPadding, Math.min(maxY, newY)) 
      }));
    };

    const handleMouseUp = () => {
      setDraggedNode(null);
      setIsPanning(false);
      setResizingNode(null);
      setMovingDiagram(false);
    };

    const handlePanStart = (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    };

    const handlePanMove = (e) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      }
    };

    const wrapText = (text, maxWidth) => {
      const charWidth = 1.1;
      const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));
      const lines = [];
      let currentText = text;
      while (currentText.length > charsPerLine) {
        lines.push(currentText.substring(0, charsPerLine));
        currentText = currentText.substring(charsPerLine);
      }
      if (currentText) lines.push(currentText);
      return lines;
    };

    const viewBox = `${-pan.x / zoom} ${-pan.y / zoom} ${width / zoom} ${height / zoom}`;
    
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: isPanning ? "grabbing" : (draggedNode ? "grabbing" : "default"), boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", touchAction: "none" }}
        onMouseMove={(e) => { handleMouseMove(e); handlePanMove(e); }}
        onMouseDown={handlePanStart}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        data-flow-diagram
      >
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="0.4" fill="#d1d5db" />
          </pattern>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L6,3 z" fill="#64748b" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {/* Diagram Move Handle - Hover Area */}
        <rect
          x="10"
          y="10"
          width="12"
          height="12"
          fill="transparent"
          onMouseEnter={() => setHoverMoveHandle(true)}
          onMouseLeave={() => setHoverMoveHandle(false)}
          style={{ cursor: "move" }}
        />
        {hoverMoveHandle && (
          <g
            onMouseDown={handleDiagramMoveStart}
            onMouseEnter={() => setHoverMoveHandle(true)}
            onMouseLeave={() => setHoverMoveHandle(false)}
            style={{ cursor: "move" }}
          >
            <rect
              x="10"
              y="10"
              width="12"
              height="12"
              fill="white"
              stroke="#8b5cf6"
              strokeWidth="0.6"
              rx="2"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
            />
            <text
              x="16"
              y="18"
              textAnchor="middle"
              fontSize="8"
              fill="#8b5cf6"
              pointerEvents="none"
            >
              ✥
            </text>
          </g>
        )}
        {connections.map((c, idx) => {
          const from = positions.get(c.from);
          const to = positions.get(c.to);
          if (!from || !to) return null;
          
          // Get individual node sizes for proper boundary anchoring
          const fromSize = getNodeSize(c.from);
          const toSize = getNodeSize(c.to);
          
          // Anchor to bottom center of source node and top center of target node
          const x1 = from.x + fromSize.width / 2;
          const y1 = from.y + fromSize.height;
          const x2 = to.x + toSize.width / 2;
          const y2 = to.y;
          
          // Create orthogonal path with curved corners
          const midY = (y1 + y2) / 2;
          const cornerRadius = 5; // Radius for rounded corners
          
          // Calculate points for curved corners
          const verticalLength = Math.abs(midY - y1);
          const horizontalLength = Math.abs(x2 - x1);
          const radius = Math.min(cornerRadius, verticalLength / 2, horizontalLength / 2);
          
          // Build path with smooth curves at corners
          let pathD;
          if (x1 === x2) {
            // Straight vertical line
            pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // Determine curve directions based on movement direction
            const goingDown = y1 < midY;
            const targetBelow = midY < y2;
            
            // First corner: from vertical to horizontal
            const cornerY1 = goingDown ? midY - radius : midY + radius;
            
            // Second corner: from horizontal to vertical (opposite curve direction)
            const cornerY2 = targetBelow ? midY + radius : midY - radius;
            
            if (x1 < x2) {
              // Moving right
              // First curve: vertical to horizontal (curving right)
              // Second curve: horizontal to vertical (curving in opposite direction)
              pathD = `M ${x1} ${y1} L ${x1} ${cornerY1} Q ${x1} ${midY} ${x1 + radius} ${midY} L ${x2 - radius} ${midY} Q ${x2} ${midY} ${x2} ${cornerY2} L ${x2} ${y2}`;
            } else {
              // Moving left
              // First curve: vertical to horizontal (curving left)
              // Second curve: horizontal to vertical (curving in opposite direction)
              pathD = `M ${x1} ${y1} L ${x1} ${cornerY1} Q ${x1} ${midY} ${x1 - radius} ${midY} L ${x2 + radius} ${midY} Q ${x2} ${midY} ${x2} ${cornerY2} L ${x2} ${y2}`;
            }
          }
          
          return (
            <path
              key={idx}
              d={pathD}
              stroke="#64748b"
              fill="none"
              strokeWidth="0.3"
              markerEnd="url(#arrow)"
            />
          );
        })}
        {steps.map((s) => {
          const pos = positions.get(s.id);
          if (!pos) return null;
          const { x, y } = pos;
          const nodeSize = getNodeSize(s.id);
          const nodeWidth = nodeSize.width;
          const nodeHeight = nodeSize.height;
          const type = shapeMap[s.type] || "process";
          const isSelected = selectedNode === s.id;
          const strokeColor = isSelected ? "#7c3aed" : "rgba(100, 116, 139, 0.6)";
          const strokeWidth = isSelected ? 1 : 0.5;

          return (
            <g
              key={s.id}
              onMouseDown={(e) => handleMouseDown(e, s.id)}
              onMouseEnter={() => showMenu(s.id)}
              onMouseLeave={hideMenuWithDelay}
              style={{ cursor: "grab" }}
            >
              {/* Selection highlight ring for shift+click */}
              {selectedNodesForConnection.includes(s.id) && (
                <>
                  <rect
                    x={x - 4}
                    y={y - 4}
                    width={nodeWidth + 8}
                    height={nodeHeight + 8}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="1"
                    strokeDasharray="4,2"
                    rx="4"
                    ry="4"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="12" dur="1s" repeatCount="indefinite" />
                  </rect>
                  <text
                    x={x - 6}
                    y={y - 6}
                    fontSize="4"
                    fontWeight="bold"
                    fill="#3b82f6"
                    pointerEvents="none"
                  >
                    {selectedNodesForConnection.indexOf(s.id) + 1}
                  </text>
                </>
              )}
              {type === "terminator" && (
                <rect
                  rx="8"
                  ry="8"
                  x={x}
                  y={y}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill="rgba(251, 146, 60, 0.2)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "process" && (
                <rect
                  rx="3"
                  ry="3"
                  x={x}
                  y={y}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill="rgba(59, 130, 246, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "decision" && (
                <polygon
                  points={`${x + nodeWidth / 2},${y} ${x + nodeWidth},${y + nodeHeight / 2} ${x + nodeWidth / 2},${y + nodeHeight} ${x},${y + nodeHeight / 2}`}
                  fill="rgba(244, 63, 94, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "io" && (
                <polygon
                  points={`${x + 10},${y} ${x + nodeWidth},${y} ${x + nodeWidth - 10},${y + nodeHeight} ${x},${y + nodeHeight}`}
                  fill="rgba(202, 188, 44, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "database" && (
                <>
                  <ellipse cx={x + nodeWidth / 2} cy={y + 5} rx={nodeWidth / 2} ry="5" fill="rgba(168, 85, 247, 0.15)" stroke={strokeColor} strokeWidth={strokeWidth} />
                  <rect rx="2" ry="2" x={x} y={y + 5} width={nodeWidth} height={nodeHeight - 10} fill="rgba(168, 85, 247, 0.15)" stroke={strokeColor} strokeWidth={strokeWidth} />
                  <ellipse cx={x + nodeWidth / 2} cy={y + nodeHeight - 5} rx={nodeWidth / 2} ry="5" fill="rgba(168, 85, 247, 0.15)" stroke={strokeColor} strokeWidth={strokeWidth} />
                </>
              )}
              {type === "subprocess" && (
                <>
                  <rect rx="3" ry="3" x={x} y={y} width={nodeWidth} height={nodeHeight} fill="rgba(96, 165, 250, 0.15)" stroke={strokeColor} strokeWidth={strokeWidth} />
                  <rect rx="2" ry="2" x={x + 3} y={y} width={nodeWidth - 6} height={nodeHeight} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                </>
              )}
              {type === "document" && (
                <path
                  d={`M${x} ${y} H ${x + nodeWidth} V ${y + nodeHeight - 5} Q ${x + nodeWidth - 10} ${y + nodeHeight} ${x + nodeWidth - 20} ${y + nodeHeight - 5} Q ${x + nodeWidth - 30} ${y + nodeHeight} ${x + nodeWidth - 40} ${y + nodeHeight - 5} V ${y}`}
                  fill="rgba(34, 197, 94, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "manual" && (
                <polygon
                  points={`${x},${y + nodeHeight} ${x + 10},${y} ${x + nodeWidth},${y} ${x + nodeWidth - 10},${y + nodeHeight}`}
                  fill="rgba(249, 115, 22, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "delay" && (
                <path
                  d={`M${x} ${y + nodeHeight / 2} A ${nodeWidth / 2} ${nodeHeight / 2} 0 1 1 ${x + nodeWidth} ${y + nodeHeight / 2}`}
                  fill="rgba(107, 114, 128, 0.15)"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
              )}
              {type === "connector" && (
                <circle cx={x + nodeWidth / 2} cy={y + nodeHeight / 2} r="8" fill="rgba(239, 68, 68, 0.15)" stroke={strokeColor} strokeWidth={strokeWidth} />
              )}
              <text
                x={x + nodeWidth / 2}
                y={nodeSubtext.get(s.id) ? y + nodeHeight / 2 - 2 : y + nodeHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="3"
                fontWeight="600"
                fontFamily="'Courier New', 'Monaco', monospace"
                fill="#1e293b"
                pointerEvents="none"
              >
                {wrapText(s.label, nodeWidth - 6).map((line, idx, arr) => {
                  const totalLines = arr.length;
                  const offset = (idx - (totalLines - 1) / 2) * 5;
                  return (
                    <tspan key={idx} x={x + nodeWidth / 2} dy={idx === 0 ? 0 : 5}>
                      {line}
                    </tspan>
                  );
                })}
              </text>
              {nodeSubtext.get(s.id) && nodeSubtext.get(s.id).length > 0 && (
                <text
                  x={x + 2}
                  y={y + nodeHeight / 2 + 2}
                  textAnchor="start"
                  fontSize="2"
                  fontStyle="italic"
                  fill="#64748b"
                  pointerEvents="none"
                >
                  {nodeSubtext.get(s.id).map((item, idx) => (
                    <tspan key={idx} x={x + 2} dy={idx === 0 ? 0 : 2.2}>
                      • {item}
                    </tspan>
                  ))}
                </text>
              )}
              {/* Resize Handle on Left */}
              {hoveredNode === s.id && (
                <g
                  onMouseEnter={cancelHideMenu}
                  onMouseLeave={hideMenuWithDelay}
                  onMouseDown={(e) => handleResizeStart(e, s.id)}
                  style={{ cursor: "ew-resize" }}
                >
                  <rect
                    x={x - 8}
                    y={y + nodeHeight / 2 - 4}
                    width="6"
                    height="8"
                    fill="white"
                    stroke="#3b82f6"
                    strokeWidth="0.5"
                    rx="1"
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
                  />
                  <text
                    x={x - 5}
                    y={y + nodeHeight / 2 + 1}
                    textAnchor="middle"
                    fontSize="3"
                    fill="#3b82f6"
                    pointerEvents="none"
                  >
                    ↔
                  </text>
                </g>
              )}
              {hoveredNode === s.id && menuNode === s.id && (
                <g
                  onMouseEnter={cancelHideMenu}
                  onMouseLeave={hideMenuWithDelay}
                >
                  <rect
                    x={x + nodeWidth + 2}
                    y={y}
                    width="30"
                    height="20"
                    fill="white"
                    stroke="#e2e8f0"
                    strokeWidth="0.5"
                    rx="1"
                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
                  />
                  {/* Edit Button */}
                  <g
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); handleEditStart(s.id, s.label); }}
                  >
                    <rect x={x + nodeWidth + 3} y={y + 1} width="28" height="5.5" fill="transparent" />
                    <text x={x + nodeWidth + 5} y={y + 4} fontSize="2.5" fill="#3b82f6">✏️ Edit</text>
                  </g>
                  {/* Add Subset Button */}
                  <g
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); handleAddSubset(s.id); }}
                  >
                    <rect x={x + nodeWidth + 3} y={y + 7} width="28" height="5.5" fill="transparent" />
                    <text x={x + nodeWidth + 5} y={y + 10} fontSize="2.5" fill="#10b981">➕ Subset</text>
                  </g>
                  {/* Add Info Button */}
                  <g
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); handleAddMetadata(s.id); }}
                  >
                    <rect x={x + nodeWidth + 3} y={y + 13} width="28" height="5.5" fill="transparent" />
                    <text x={x + nodeWidth + 5} y={y + 16} fontSize="2.5" fill="#f59e0b">ℹ️ Add Info</text>
                  </g>
                  {/* Delete Button */}
                  <g
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                  >
                    <rect x={x + nodeWidth + 3} y={y + 19} width="28" height="5.5" fill="transparent" />
                    <text x={x + nodeWidth + 5} y={y + 22} fontSize="2.5" fill="#ef4444">🗑️ Delete</text>
                  </g>
                </g>
              )}
              {/* Drag handle at bottom edge */}
              {hoveredNode === s.id && (
                <g style={{ cursor: "grab" }}>
                  <rect
                    x={x + nodeWidth / 2 - 3}
                    y={y + nodeHeight - 1}
                    width="6"
                    height="2"
                    fill={isSelected ? "#7c3aed" : "#64748b"}
                    opacity="0.8"
                    rx="1"
                  />
                  <circle
                    cx={x + nodeWidth / 2}
                    cy={y + nodeHeight}
                    r="2"
                    fill={isSelected ? "#7c3aed" : "#64748b"}
                    opacity="0.8"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  const copyToClipboard = (t) => {
    navigator.clipboard.writeText(t);
    alert("Copied to clipboard!");
  };

  const generateWorkflow = async () => {
    if (!text.trim()) {
      setError("Please enter a workflow description");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("https://us-central1-try1-7d848.cloudfunctions.net/parseWorkflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      if (!response.ok) throw new Error("Failed to generate diagram");
      const data = await response.json();
      let rawDiagram = data.mermaid || "";
      
      // Clean the diagram - remove markdown code fences if present
      rawDiagram = rawDiagram.trim();
      rawDiagram = rawDiagram.replace(/^```mermaid\s*/i, '');
      rawDiagram = rawDiagram.replace(/^```\s*/i, ''); // Also handle plain ```
      rawDiagram = rawDiagram.replace(/\s*```$/g, '');
      rawDiagram = rawDiagram.trim();
      
      // Apply clean minimal styling theme with flexible node wrapping
      const styledDiagram = `%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#ffffff",
  "primaryBorderColor": "#999999",
  "primaryTextColor": "#333333",
  "lineColor": "#999999",
  "fontSize": "14px",
  "fontFamily": "Inter, Roboto, Arial, sans-serif",
  "nodeBorderRadius": "8px",
  "secondaryColor": "#f9f9f9",
  "tertiaryColor": "#eeeeee"
}, "flowchart": {"htmlLabels": true, "curve": "basis", "useMaxWidth": false}}}%%
${rawDiagram}`;
      
      setDiagram(styledDiagram);
      
      // Automatically parse and populate the flowchart
      const { nodes, edges } = parseMermaid(rawDiagram);
      if (nodes.length > 0) {
        const autoSteps = nodes.map(node => ({
          id: node.id,
          label: node.label,
          type: node.type
        }));
        setSteps(autoSteps);
        setConnections(edges);
        setNodePositions(new Map()); // Reset positions for new diagram
        setSelectedNode(null);
      }
      
      const newIteration = { index: currentIteration + 1, timestamp: Date.now(), prompt: text, diagram: styledDiagram };
      setIterationHistory([...iterationHistory, newIteration]);
      setCurrentIteration(currentIteration + 1);
    } catch (err) {
      setError(err.message || "Error generating diagram");
    } finally {
      setLoading(false);
    }
  };

  const saveDiagram = async () => {
    if (!diagram) {
      setError("No diagram to save. Generate one first.");
      return;
    }
    if (!saveName.trim()) {
      setError("Please enter a name for the diagram");
      return;
    }
    try {
      await uploadString(ref(storage, `diagrams/${saveName}.mmd`), diagram);
      setSaveName("");
      loadSavedDiagrams();
    } catch (err) {
      setError("Failed to save diagram: " + err.message);
    }
  };

  const exportToManPro = async () => {
    if (steps.length === 0) {
      setError("No workflow to export. Create nodes first.");
      return;
    }

    try {
      // Build hierarchical structure
      const workflowData = {
        exportDate: new Date().toISOString(),
        className: steps[0]?.label || "Workflow Project", // Primary node as project name
        nodes: steps.map(step => ({
          id: step.id,
          label: step.label,
          type: step.type,
          subsets: nodeSubtext.get(step.id) || [],
          metadata: nodeMetadata.get(step.id) || {}
        })),
        connections: connections
      };

      // Save to Firebase at integrations path
      const exportRef = ref(storage, `integrations/workflow-to-manpro/export-${Date.now()}.json`);
      await uploadString(exportRef, JSON.stringify(workflowData, null, 2));
      
      alert("✅ Workflow exported successfully!\n\nOpen ManPro (http://localhost:3000) and click 'Import from Workflow' to load this workflow.");
    } catch (err) {
      setError("Failed to export workflow: " + err.message);
    }
  };

  const loadSavedDiagrams = async () => {
    try {
      const listRef = ref(storage, "diagrams");
      const result = await listAll(listRef);
      setSavedDiagrams(result.items.map((item) => item.name.replace(".mmd", "")));
    } catch (err) {
      setError("Failed to load diagrams: " + err.message);
    }
  };

  const loadDiagram = async (fileName) => {
    try {
      console.log("Loading diagram:", fileName);
      setError(""); // Clear any previous errors
      
      // Get download URL and fetch content
      const fileRef = ref(storage, `diagrams/${fileName}.mmd`);
      const downloadURL = await getDownloadURL(fileRef);
      console.log("Download URL:", downloadURL);
      
      const response = await fetch(downloadURL);
      const loadedDiagram = await response.text();
      console.log("Loaded diagram content:", loadedDiagram);
      setDiagram(loadedDiagram);
      
      // Parse and populate the interactive canvas
      try {
        const { nodes, edges } = parseMermaid(loadedDiagram);
        console.log("Parsed nodes:", nodes, "edges:", edges);
        if (nodes.length > 0) {
          const autoSteps = nodes.map(node => ({
            id: node.id,
            label: node.label,
            type: node.type
          }));
          setSteps(autoSteps);
          setConnections(edges);
          setNodePositions(new Map());
          setSelectedNode(null);
          console.log("Successfully loaded diagram with", autoSteps.length, "nodes");
        }
      } catch (parseErr) {
        console.error("Parse error:", parseErr);
        setError("Loaded but failed to parse: " + parseErr.message);
      }
      
      setShowLoadModal(false);
    } catch (err) {
      console.error("Load error:", err);
      setError("Failed to load diagram: " + err.message);
    }
  };

  const exportSVG = () => {
    try {
      const svgElement = document.querySelector('svg[data-flow-diagram]');
      if (!svgElement) {
        setError("No diagram found to export. Generate a diagram first.");
        return;
      }

      // Clone the SVG to avoid modifying the original
      const svgClone = svgElement.cloneNode(true);
      
      // Add XML namespace if not present
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      
      // Serialize the SVG
      const svgData = new XMLSerializer().serializeToString(svgClone);
      
      // Create blob and download
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `workflow-diagram-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log("SVG exported successfully");
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export SVG: " + err.message);
    }
  };

  useEffect(() => {
    loadSavedDiagrams();
    if (diagram) {
      const el = document.getElementById("mermaid-diagram");
      if (el) {
        el.removeAttribute('data-processed');
        // Clean the diagram text - remove markdown code fences if present
        let cleanDiagram = diagram.trim();
        cleanDiagram = cleanDiagram.replace(/^```mermaid\s*/i, '');
        cleanDiagram = cleanDiagram.replace(/\s*```$/, '');
        el.innerHTML = cleanDiagram;
        mermaid.init(undefined, el);
      }
    }
  }, [diagram]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: "95%", margin: "0 auto" }}>
        <h1 style={{ color: "white", textAlign: "center", marginBottom: "10px", fontSize: "2.5rem", fontWeight: "700" }}>🎯 AI Workflow Diagram Generator</h1>
        <p style={{ color: "#e0e7ff", textAlign: "center" }}>Transform your ideas into visual diagrams instantly</p>

        <div style={{ backgroundColor: "rgba(255, 255, 255, 0.95)", borderRadius: "20px", padding: "30px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", backdropFilter: "blur(10px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label htmlFor="workflow-description" style={{ fontWeight: 600, color: "#1e293b" }}>
              Workflow description {currentIteration > 0 && <span style={{ color: "#7e22ce", fontSize: "14px" }}>(Iteration {currentIteration + 1})</span>}
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <a href="http://localhost:5173" target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>🤖 TeachAI</a>
              <a href="https://try1-7d848-d175e.web.app" target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>📊 ManPro Dashboard</a>
              <button onClick={exportToManPro} disabled={steps.length === 0} style={{ padding: "8px 16px", background: steps.length === 0 ? "#9ca3af" : "linear-gradient(135deg, #ec4899, #d946ef)", color: "white", border: "none", borderRadius: "8px", cursor: steps.length === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "14px" }}>🔗 Export to ManPro</button>
              <button onClick={() => { loadSavedDiagrams(); setShowLoadModal(true); }} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>📂 Load</button>
              {diagram && <button onClick={exportSVG} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>⬇️ Export SVG</button>}
              {diagram && <span style={{ fontSize: "14px", color: "#059669", fontWeight: 500 }}>💡 Keep refining your description below</span>}
            </div>
          </div>

          <textarea id="workflow-description" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe your workflow... (e.g., User signs up → verify email → create profile → send welcome email)" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", height: "120px", padding: "15px", fontSize: "16px", border: "2px solid #e0e7ff", borderRadius: "12px", marginBottom: "20px", resize: "vertical", fontFamily: "inherit", transition: "border-color 0.3s", outline: "none" }} onFocus={(e) => (e.target.style.borderColor = "#7e22ce")} onBlur={(e) => (e.target.style.borderColor = "#e0e7ff")} />

          {/* Freestyle Canvas with react-sketch-canvas */}
          <div style={{ marginTop: "20px", backgroundColor: "rgba(255, 255, 255, 0.95)", borderRadius: "16px", padding: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", border: "2px solid #e0e7ff", transition: "all 0.3s ease" }}>
            <div 
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: canvasCollapsed ? "0" : "12px", cursor: "pointer", userSelect: "none" }}
              onClick={() => setCanvasCollapsed(!canvasCollapsed)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ 
                  fontSize: "20px", 
                  transition: "transform 0.3s ease", 
                  transform: canvasCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  display: "inline-block"
                }}>
                  ▼
                </span>
                <h3 style={{ color: "#1e3c72", margin: 0 }}>🎨 Freestyle Drawing Canvas</h3>
              </div>
            </div>
            
            <div style={{
              maxHeight: canvasCollapsed ? "0" : "2000px",
              overflow: "hidden",
              transition: "max-height 0.5s ease-in-out, opacity 0.3s ease-in-out",
              opacity: canvasCollapsed ? 0 : 1
            }}>
                <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "12px" }}>✏️ Draw freely, add notes and sketches on the canvas</p>
            
            {/* Simple Toolbar */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", padding: "12px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", flexWrap: "wrap" }}>
              {/* Drawing Tools Dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>🎨 Tool:</span>
                <select 
                  value={drawMode}
                  onChange={(e) => { setDrawMode(e.target.value); setEraseMode(false); }}
                  style={{ 
                    padding: "8px 12px", 
                    background: '#fff', 
                    color: '#374151', 
                    border: "2px solid #e5e7eb", 
                    borderRadius: "6px", 
                    cursor: "pointer", 
                    fontSize: "13px", 
                    fontWeight: 500,
                    minWidth: "150px"
                  }}
                >
                  <option value="select">👆 Select/Move</option>
                  <option value="pen">✏️ Pen</option>
                  <option value="line">📏 Line</option>
                  <option value="arrow">➡️ Arrow</option>
                  <option value="rectangle">▭ Rectangle</option>
                  <option value="roundedRect">▢ Rounded Box</option>
                  <option value="circle">○ Circle</option>
                  <option value="curvedLine">〰️ Curved Line</option>
                  <option value="text">T Text</option>
                </select>
              </div>

              <div style={{ width: "1px", height: "30px", background: "#e5e7eb" }} />

              {/* Color Picker */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>✏️ Color:</span>
                <input 
                  type="color" 
                  value={drawColor} 
                  onChange={(e) => setDrawColor(e.target.value)} 
                  style={{ width: "40px", height: "36px", border: "2px solid #e5e7eb", borderRadius: "6px", cursor: "pointer" }}
                />
              </div>

              {/* Stroke Width */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>📏 Width:</span>
                <input 
                  type="range" 
                  min="1" 
                  max="20" 
                  value={strokeWidth} 
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  style={{ width: "120px" }}
                />
                <span style={{ fontSize: "13px", color: "#6b7280", minWidth: "35px" }}>{strokeWidth}px</span>
              </div>

              {/* Text Font Size (only show when text mode) */}
              {drawMode === 'text' && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>📝 Text Size:</span>
                  <input 
                    type="range" 
                    min="10" 
                    max="72" 
                    value={textFontSize} 
                    onChange={(e) => setTextFontSize(Number(e.target.value))}
                    style={{ width: "120px" }}
                  />
                  <span style={{ fontSize: "13px", color: "#6b7280", minWidth: "35px" }}>{textFontSize}px</span>
                </div>
              )}

              <div style={{ flex: 1 }} />

              {/* Eraser Mode */}
              <button 
                onClick={() => {
                  setEraseMode(!eraseMode);
                  setDrawMode('pen');
                  if (sketchCanvasRef.current) {
                    sketchCanvasRef.current.eraseMode(!eraseMode);
                  }
                }}
                style={{ padding: "8px 16px", background: eraseMode ? '#ef4444' : '#fff', color: eraseMode ? '#fff' : '#374151', border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                {eraseMode ? '✏️ Draw' : '🧹 Erase'}
              </button>

              {/* Undo */}
              <button 
                onClick={() => {
                  if (sketchCanvasRef.current) {
                    sketchCanvasRef.current.undo();
                  }
                }}
                style={{ padding: "8px 16px", background: '#fff', color: '#374151', border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                ↶ Undo
              </button>

              {/* Redo */}
              <button 
                onClick={() => {
                  if (sketchCanvasRef.current) {
                    sketchCanvasRef.current.redo();
                  }
                }}
                style={{ padding: "8px 16px", background: '#fff', color: '#374151', border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                ↷ Redo
              </button>

              {/* Clear */}
              <button 
                onClick={() => {
                  if (sketchCanvasRef.current) {
                    sketchCanvasRef.current.clearCanvas();
                  }
                  setShapes([]);
                }}
                style={{ padding: "8px 16px", background: '#fff', color: '#ef4444', border: "1px solid #ef4444", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                🗑️ Clear All
              </button>

              {/* Save/Load */}
              <button 
                onClick={() => setShowAnnotationModal(true)} 
                style={{ padding: "8px 16px", background: '#3b82f6', color: '#fff', border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                💾 Save/Load
              </button>
            </div>

            {/* Canvas Container with Layered Canvases */}
            <div style={{ position: "relative", border: "2px solid #bae6fd", borderRadius: "8px", overflow: "hidden", background: "#ffffff", width: "100%", height: "500px" }}>
              {/* React Sketch Canvas for free-hand drawing */}
              <ReactSketchCanvas
                ref={sketchCanvasRef}
                strokeWidth={drawMode === 'pen' ? strokeWidth : 0}
                strokeColor={drawColor}
                canvasColor="transparent"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: drawMode === 'pen' || eraseMode ? 'auto' : 'none' }}
                exportWithBackgroundImage={true}
              />
              
              {/* Shape Canvas Overlay */}
              <canvas
                ref={shapeCanvasRef}
                width={2000}
                height={500}
                style={{ 
                  position: "absolute", 
                  top: 0, 
                  left: 0, 
                  width: "100%", 
                  height: "100%", 
                  zIndex: 2,
                  pointerEvents: (drawMode !== 'pen' && !eraseMode && !editingText) ? 'auto' : 'none',
                  cursor: drawMode === 'select' ? resizeCursor : (drawMode !== 'pen' ? 'crosshair' : 'default')
                }}
                onMouseDown={handleShapeMouseDown}
                onMouseMove={handleShapeMouseMove}
                onMouseUp={handleShapeMouseUp}
                onDoubleClick={handleShapeDoubleClick}
              />
              
              {/* Text Input Overlay */}
              {editingText && (() => {
                const textShape = shapes.find(s => s.id === editingText.shapeId);
                if (!textShape) return null;
                
                // Get canvas position
                const canvas = shapeCanvasRef.current;
                if (!canvas) return null;
                const rect = canvas.getBoundingClientRect();
                const scaleX = rect.width / canvas.width;
                const scaleY = rect.height / canvas.height;
                
                // Use effect to focus after render
                setTimeout(() => {
                  if (textInputRef.current) {
                    textInputRef.current.focus();
                    textInputRef.current.setSelectionRange(
                      textInputRef.current.value.length,
                      textInputRef.current.value.length
                    );
                  }
                }, 0);
                
                return (
                  <textarea
                    ref={textInputRef}
                    value={textShape.text || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      setShapes(prev => prev.map(s => 
                        s.id === editingText.shapeId ? {...s, text: e.target.value} : s
                      ));
                    }}
                    onBlur={(e) => {
                      // Only close if clicking outside, not on textarea itself
                      if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
                        setEditingText(null);
                        setDrawMode('select');
                        setSelectedShape(textShape.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
                        setEditingText(null);
                        setDrawMode('select');
                        setSelectedShape(textShape.id);
                        e.preventDefault();
                      }
                    }}
                    onKeyPress={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    placeholder="Type text... (Ctrl+Enter or Esc to finish)"
                    style={{
                      position: 'absolute',
                      left: `${textShape.x * scaleX}px`,
                      top: `${textShape.y * scaleY}px`,
                      font: `${textShape.fontSize * scaleY}px 'Caveat', 'Comic Sans MS', cursive, sans-serif`,
                      color: textShape.color || '#000000',
                      border: '2px solid #3b82f6',
                      background: 'rgba(255, 255, 255, 0.98)',
                      outline: 'none',
                      padding: '4px 8px',
                      margin: '0',
                      resize: 'none',
                      overflow: 'hidden',
                      minWidth: '200px',
                      minHeight: `${textShape.fontSize * scaleY * 1.4}px`,
                      lineHeight: '1.2',
                      zIndex: 1000,
                      pointerEvents: 'auto',
                      boxShadow: '0 2px 12px rgba(59, 130, 246, 0.3)',
                      borderRadius: '4px'
                    }}
                  />
                );
              })()}
            </div>
            </div>
          </div>

          {diagram && (
            <>
              <div style={{ marginTop: "20px", backgroundColor: "rgba(255, 255, 255, 0.95)", borderRadius: "16px", padding: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", border: "2px solid #e0e7ff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ color: "#1e3c72", margin: 0 }}>🧩 Interactive Canvas</h3>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <label style={{ fontSize: "10px", color: "#64748b" }}>Size:</label>
                      <input type="range" min="0.5" max="3" step="0.1" value={nodeScale} onChange={(e) => setNodeScale(parseFloat(e.target.value))} style={{ width: "60px" }} />
                      <span style={{ fontSize: "10px", color: "#64748b", minWidth: "30px" }}>{Math.round(nodeScale * 100)}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <label style={{ fontSize: "10px", color: "#64748b" }}>Space:</label>
                      <input type="range" min="0.2" max="3" step="0.1" value={nodeSpacing} onChange={(e) => setNodeSpacing(parseFloat(e.target.value))} style={{ width: "60px" }} />
                      <span style={{ fontSize: "10px", color: "#64748b", minWidth: "30px" }}>{Math.round(nodeSpacing * 100)}%</span>
                    </div>
                    <button onClick={() => setZoom(z => Math.min(20, z * 1.2))} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }} title="Zoom In">🔍+</button>
                    <button onClick={() => setZoom(z => Math.max(0.02, z / 1.2))} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }} title="Zoom Out">🔍-</button>
                    <button onClick={() => { setZoom(11.5); setPan({ x: 0, y: 0 }); setNodeScale(1); setNodeSpacing(0.5); }} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "4px", cursor: "pointer", fontSize: "10px" }} title="Reset View">Reset</button>
                    <button onClick={autoArrangeHorizontal} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "linear-gradient(135deg, #06b6d4, #0891b2)", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "10px" }} title="Auto-arrange nodes horizontally">→ H</button>
                    <button onClick={autoArrangeVertical} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "10px" }} title="Auto-arrange nodes vertically">↓ V</button>
                    <span style={{ padding: "4px 8px", border: "1px solid #e2e8f0", background: "#f9fafb", borderRadius: "4px", fontSize: "10px" }}>{Math.round(zoom * 100)}%</span>
                  </div>
                </div>
                <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "12px" }}>💡 Scroll to zoom (2%-2000%) • Middle-click + drag to pan • Drag shapes to arrange</p>
                {selectedNodesForConnection.length > 0 && (
                  <div style={{ 
                    padding: "10px 16px", 
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)", 
                    color: "white", 
                    borderRadius: "8px", 
                    marginBottom: "12px", 
                    fontSize: "13px",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)"
                  }}>
                    <span>🔗</span>
                    <span>
                      {selectedNodesForConnection.length === 1 
                        ? `1 node selected. Hold Shift and click another node to connect.`
                        : `2 nodes selected. Press Enter to create connection.`}
                    </span>
                    <button 
                      onClick={() => setSelectedNodesForConnection([])}
                      style={{
                        marginLeft: "auto",
                        padding: "4px 10px",
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        borderRadius: "4px",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "11px"
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <p style={{ color: "#64748b", fontSize: "12px", marginBottom: "12px", fontStyle: "italic" }}>
                  💡 Tip: Hold <strong>Shift</strong> and click 2 nodes, then press <strong>Enter</strong> to connect them
                </p>

                <div 
                  style={{ width: "100%", height: "500px", overflow: "hidden", border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "16px", display: "block", position: "relative" }}
                  onMouseEnter={() => { document.body.style.overflow = 'hidden'; }}
                  onMouseLeave={() => { document.body.style.overflow = 'auto'; }}
                >
                  {renderFlowSVGReact()}
                </div>
                <h3 style={{ color: "#1e3c72", marginTop: "16px", marginBottom: "12px" }}>🧩 Step List</h3>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <select style={{ flex: 1, padding: "8px", border: "1px solid #e2e8f0", borderRadius: "8px" }} onChange={(e) => { const step = parseMermaid(diagram).nodes.find((s) => s.id === e.target.value); if (step) setNewStep({ label: step.label, type: step.type }); }}>
                    <option value="">Select step from diagram...</option>
                    {parseMermaid(diagram).nodes.map((s) => (
                      <option key={s.id} value={s.id}>{`${s.id}: ${s.label}`}</option>
                    ))}
                  </select>
                  <select value={newStep.type} onChange={(e) => setNewStep({ ...newStep, type: e.target.value })} style={{ padding: "8px", border: "1px solid #e2e8f0", borderRadius: "8px", minWidth: "150px" }}>
                    {Object.keys(shapeMap).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => { if (!newStep.label.trim()) return; const id = `S${steps.length + 1}`; setSteps([...steps, { id, label: newStep.label, type: newStep.type }]); setNewStep({ label: "", type: "Process" }); }} style={{ padding: "8px 12px", border: "none", background: "#2563eb", color: "#fff", borderRadius: "8px", cursor: "pointer" }}>Add Step</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                  {steps.map((s) => (
                    <div key={s.id} style={{ padding: "6px 10px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px" }}>{`${s.id}: ${s.label} (${s.type})`}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ color: "#64748b" }}>Connect:</span>
                  <select id="fromSel" style={{ padding: "6px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                    {steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select id="toSel" style={{ padding: "6px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                    {steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => { const from = document.getElementById("fromSel").value; const to = document.getElementById("toSel").value; if (from && to && from !== to) setConnections([...connections, { from, to }]); }} style={{ padding: "8px 12px", border: "none", background: "#10b981", color: "#fff", borderRadius: "8px", cursor: "pointer" }}>Add Connection</button>
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <details style={{ flex: 1, cursor: "pointer" }}>
              <summary style={{ fontWeight: 600, color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px", userSelect: "none" }}>📝 View Mermaid Code</summary>
              <pre style={{ backgroundColor: "#1e293b", color: "#e2e8f0", padding: "15px", borderRadius: "8px", marginTop: "12px", overflow: "auto", fontSize: "13px", fontFamily: "Courier New, monospace" }}>{diagram}</pre>
            </details>
          </div>

          <div style={{ padding: "25px", backgroundColor: "#f0f9ff", borderRadius: "12px", border: "2px solid #bfdbfe" }}>
            <h3 style={{ color: "#1e40af", marginBottom: "15px", fontSize: "1.2rem" }}>💾 Save Diagram</h3>
            <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Enter a name for this diagram..." style={{ width: "100%", padding: "10px", border: "1px solid #93c5fd", borderRadius: "8px" }} />
            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button onClick={saveDiagram} style={{ padding: "10px 14px", background: "linear-gradient(135deg, #2563eb, #7e22ce)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>Save Mermaid</button>
              <button onClick={() => copyToClipboard(diagram)} style={{ padding: "10px 14px", background: "#e2e8f0", color: "#334155", border: "none", borderRadius: "8px", cursor: "pointer" }} onMouseOver={(e) => (e.target.style.background = "#cbd5e1")} onMouseOut={(e) => (e.target.style.background = "#e2e8f0")}>📋 Copy Code</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={generateWorkflow} style={{ background: loading ? "#9ca3af" : "linear-gradient(135deg, #7e22ce, #2563eb)", color: "white", border: "none", borderRadius: "12px", cursor: loading ? "not-allowed" : "pointer", padding: "12px 16px", fontWeight: 600, transition: "all 0.3s" }}>{loading ? "Generating..." : diagram ? "Regenerate" : "Generate"}</button>
            {error && <div style={{ color: "#ef4444", fontWeight: 600 }}>{error}</div>}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingNode && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setEditingNode(null); setEditText(""); }}>
          <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "30px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#1e3c72", marginBottom: "20px", fontSize: "1.5rem" }}>✏️ Edit Node Text</h3>
            <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); }} placeholder="Enter new text..." style={{ width: "100%", padding: "12px", fontSize: "16px", border: "2px solid #e0e7ff", borderRadius: "8px", marginBottom: "20px", boxSizing: "border-box" }} autoFocus />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => { setEditingNode(null); setEditText(""); }} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleEditSave} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #2563eb, #7e22ce)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Subset Edit Modal */}
      {subsetEditNode && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setSubsetEditNode(null); setSubsetList([]); setCurrentSubsetInput(""); }}>
          <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "30px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#1e3c72", marginBottom: "20px", fontSize: "1.5rem" }}>➕ Add/Edit Subset List</h3>
            
            {/* Existing Items */}
            {subsetList.length > 0 && (
              <div style={{ marginBottom: "15px", maxHeight: "200px", overflow: "auto" }}>
                {subsetList.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", backgroundColor: "#f1f5f9", borderRadius: "6px", marginBottom: "6px" }}>
                    <span style={{ flex: 1, fontSize: "14px" }}>• {item}</span>
                    <button onClick={() => handleSubsetRemoveItem(idx)} style={{ padding: "4px 8px", background: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Input for new item */}
            <div style={{ marginBottom: "20px" }}>
              <input 
                type="text" 
                value={currentSubsetInput} 
                onChange={(e) => setCurrentSubsetInput(e.target.value)} 
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubsetAddItem(); } }} 
                placeholder="Type item and press Enter..." 
                style={{ width: "100%", padding: "12px", fontSize: "16px", border: "2px solid #e0e7ff", borderRadius: "8px", boxSizing: "border-box" }} 
                autoFocus 
              />
              <p style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>💡 Press Enter to add item to list</p>
            </div>
            
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => { setSubsetEditNode(null); setSubsetList([]); setCurrentSubsetInput(""); }} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSubsetSave} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>Save List</button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Edit Modal */}
      {metadataEditNode && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setMetadataEditNode(null); setMetadataFields([]); }}>
          <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "30px", maxWidth: "600px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#1e3c72", marginBottom: "20px", fontSize: "1.5rem" }}>ℹ️ Add Additional Information</h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Add extra fields (like Time, Quantity, Location) that will become custom columns in ManPro</p>
            
            {/* Existing Fields */}
            {metadataFields.map((field, idx) => (
              <div key={idx} style={{ marginBottom: "15px", padding: "15px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <input 
                    type="text" 
                    value={field.name} 
                    onChange={(e) => {
                      const updated = [...metadataFields];
                      updated[idx].name = e.target.value;
                      setMetadataFields(updated);
                    }} 
                    placeholder="Field name (e.g., 'Departure Time')" 
                    style={{ flex: 1, padding: "8px", fontSize: "14px", border: "2px solid #e0e7ff", borderRadius: "6px" }} 
                  />
                  <select 
                    value={field.type} 
                    onChange={(e) => {
                      const updated = [...metadataFields];
                      updated[idx].type = e.target.value;
                      setMetadataFields(updated);
                    }} 
                    style={{ padding: "8px", fontSize: "14px", border: "2px solid #e0e7ff", borderRadius: "6px", backgroundColor: "white" }}
                  >
                    <option value="text">Text</option>
                    <option value="time">Time</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                  <button onClick={() => setMetadataFields(metadataFields.filter((_, i) => i !== idx))} style={{ padding: "8px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>×</button>
                </div>
                <input 
                  type="text" 
                  value={field.value} 
                  onChange={(e) => {
                    const updated = [...metadataFields];
                    updated[idx].value = e.target.value;
                    setMetadataFields(updated);
                  }} 
                  placeholder="Value (e.g., '8:00 AM')" 
                  style={{ width: "100%", padding: "8px", fontSize: "14px", border: "2px solid #e0e7ff", borderRadius: "6px", boxSizing: "border-box" }} 
                />
              </div>
            ))}
            
            {/* Add New Field Button */}
            <button 
              onClick={() => setMetadataFields([...metadataFields, { name: '', value: '', type: 'text' }])} 
              style={{ width: "100%", padding: "12px", background: "#f1f5f9", border: "2px dashed #cbd5e1", borderRadius: "8px", cursor: "pointer", color: "#64748b", fontWeight: 600, marginBottom: "20px" }}
            >
              ➕ Add New Field
            </button>
            
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => { setMetadataEditNode(null); setMetadataFields([]); }} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleMetadataSave} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>Save Info</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Diagram Modal */}
      {showLoadModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowLoadModal(false)}>
          <div style={{ background: "white", borderRadius: "16px", padding: "30px", maxWidth: "500px", width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: "#1e3c72", fontSize: "24px", marginBottom: "20px" }}>📂 Load Saved Diagram</h3>
            
            {savedDiagrams.length === 0 ? (
              <p style={{ color: "#64748b", textAlign: "center", padding: "40px 20px" }}>No saved diagrams found. Save a diagram first!</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {savedDiagrams.map((name) => (
                  <div key={name} style={{ padding: "15px", border: "2px solid #e0e7ff", borderRadius: "10px", transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#7e22ce"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e0e7ff"}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ fontSize: "24px" }}>📄</div>
                      <div>
                        <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>{name}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Saved diagram</div>
                      </div>
                    </div>
                    <button onClick={() => loadDiagram(name)} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Load</button>
                  </div>
                ))}
              </div>
            )}
            
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowLoadModal(false)} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "8px", cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Annotation Save/Load Modal */}
      {showAnnotationModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAnnotationModal(false)}>
          <div style={{ background: "white", borderRadius: "16px", padding: "30px", maxWidth: "600px", width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: "#1e3c72", fontSize: "24px", marginBottom: "20px" }}>💾 Save/Load Annotations</h3>
            
            {/* Save Section */}
            <div style={{ marginBottom: "30px", padding: "20px", background: "#f0f9ff", borderRadius: "12px" }}>
              <h4 style={{ color: "#0369a1", marginBottom: "15px" }}>Save Current Annotations</h4>
              <div style={{ display: "flex", gap: "10px" }}>
                <input 
                  type="text" 
                  value={annotationSaveName} 
                  onChange={(e) => setAnnotationSaveName(e.target.value)} 
                  placeholder="Enter name for annotations..." 
                  style={{ flex: 1, padding: "12px", fontSize: "14px", border: "2px solid #bae6fd", borderRadius: "8px" }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveAnnotations(); }}
                />
                <button 
                  onClick={saveAnnotations} 
                  disabled={!annotationSaveName.trim() || annotations.length === 0}
                  style={{ padding: "12px 24px", background: annotationSaveName.trim() && annotations.length > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : '#9ca3af', color: "white", border: "none", borderRadius: "8px", cursor: annotationSaveName.trim() && annotations.length > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}
                >
                  💾 Save
                </button>
              </div>
              {annotations.length === 0 && <p style={{ fontSize: "12px", color: "#64748b", marginTop: "10px" }}>⚠️ No annotations to save. Draw something first!</p>}
            </div>

            {/* Load Section */}
            <div>
              <h4 style={{ color: "#0369a1", marginBottom: "15px" }}>Load Saved Annotations</h4>
              {savedAnnotations.length === 0 ? (
                <p style={{ color: "#64748b", textAlign: "center", padding: "40px 20px", background: "#f8fafc", borderRadius: "8px" }}>No saved annotations found. Save annotations first!</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {savedAnnotations.map((annotation, idx) => (
                    <div key={idx} style={{ padding: "15px", border: "2px solid #bae6fd", borderRadius: "10px", transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0f9ff" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#0369a1"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#bae6fd"}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ fontSize: "24px" }}>✏️</div>
                        <div>
                          <div style={{ fontWeight: 600, color: "#0c4a6e", marginBottom: "4px" }}>{annotation.name}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{annotation.annotations.length} annotations • {new Date(annotation.timestamp).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <button onClick={() => loadAnnotation(annotation)} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Load</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowAnnotationModal(false)} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: "8px", cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
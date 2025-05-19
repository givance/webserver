import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  Position,
  MarkerType,
  useReactFlow,
  Panel,
  NodeProps,
  Handle,
  ConnectionMode,
} from "reactflow";
import dagre from "dagre";
import type { DonorJourney } from "@/app/lib/data/organizations";
import { cn } from "@/lib/utils";
import type { Edge as FlowEdge, Connection } from "reactflow";

const NODE_WIDTH = 320;
const NODE_HEIGHT = 160;

// Custom node component with better styling
function CustomNode({ data, id }: NodeProps) {
  return (
    <div className="px-6 py-5 shadow-lg rounded-lg border bg-card w-[320px] max-w-[320px]">
      <div className="flex flex-col">
        <div className="font-semibold text-2xl mb-3 break-words line-clamp-2">{data.label}</div>
        <div className="text-lg text-muted-foreground break-words line-clamp-3">{data.description}</div>
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-primary" />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

// Helper function to calculate layout
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = "TB") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Increase the spacing between nodes
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 150, // Horizontal spacing between nodes
    ranksep: 200, // Vertical spacing between ranks
    edgesep: 80, // Minimum separation between edges
    ranker: "tight-tree", // Use tight tree ranking for better edge routing
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Get positioned nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  // Adjust edges to have different bezier curves when there are multiple edges between the same nodes
  const edgesBySourceTarget = edges.reduce((acc, edge) => {
    const key = `${edge.source}-${edge.target}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(edge);
    return acc;
  }, {} as Record<string, Edge[]>);

  const layoutedEdges = edges.map((edge) => {
    const key = `${edge.source}-${edge.target}`;
    const parallelEdges = edgesBySourceTarget[key];
    const index = parallelEdges.indexOf(edge);
    const totalEdges = parallelEdges.length;

    // Calculate the curve offset based on the number of parallel edges
    let curveOffset = 0;
    if (totalEdges > 1) {
      const offset = 50; // Base offset for curves
      curveOffset = offset * (index - (totalEdges - 1) / 2);
    }

    return {
      ...edge,
      type: "smoothstep",
      animated: true,
      style: {
        stroke: "hsl(var(--primary))",
        strokeWidth: 2,
        opacity: 0.8,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: "hsl(var(--primary))",
      },
      // Add label styling
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: {
        fill: "hsl(var(--card))",
        fillOpacity: 0.9,
      },
      labelStyle: {
        fill: "hsl(var(--foreground))",
        fontWeight: 500,
        fontSize: 14,
      },
      // Add routing information
      sourceHandle: `source-${index}`,
      targetHandle: `target-${index}`,
    } as Edge;
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

interface DonorJourneyGraphProps {
  journey: DonorJourney;
  className?: string;
}

export function DonorJourneyGraph({ journey, className }: DonorJourneyGraphProps) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert donor journey data to ReactFlow format with custom styling
  const { nodes, edges } = useMemo(() => {
    const initialNodes: Node[] = journey.nodes.map((node) => ({
      id: node.id,
      data: {
        label: node.label,
        ...node.properties,
      },
      type: "custom",
      position: { x: 0, y: 0 },
    }));

    const initialEdges: Edge[] = journey.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" },
      labelStyle: {
        fill: "hsl(var(--muted-foreground))",
        fontWeight: 500,
        fontSize: 14,
      },
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: "hsl(var(--primary))",
      },
      style: {
        stroke: "hsl(var(--primary))",
        strokeWidth: 3,
      },
      animated: true,
      data: edge.properties,
    }));

    return getLayoutedElements(initialNodes, initialEdges);
  }, [journey]);

  // Fit view on mount and when nodes/edges change
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 0);
    return () => clearTimeout(timer);
  }, [fitView, nodes, edges]);

  const onLayout = useCallback(
    (direction: "TB" | "LR") => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, direction);
      const flow = useReactFlow();
      flow.setNodes(layoutedNodes);
      flow.setEdges(layoutedEdges);
      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 0);
    },
    [nodes, edges, fitView]
  );

  return (
    <div ref={containerRef} className={cn("w-full h-[1000px]", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        fitViewOptions={{
          padding: 0.4,
          includeHiddenNodes: true,
        }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
        }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={20} size={1.5} />
        <Controls showInteractive={false} />
        <Panel position="top-right" className="bg-background/80 p-2 rounded-lg shadow-md">
          <div className="flex gap-2">
            <button
              onClick={() => onLayout("TB")}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-base"
            >
              Vertical Layout
            </button>
            <button
              onClick={() => onLayout("LR")}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-base"
            >
              Horizontal Layout
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

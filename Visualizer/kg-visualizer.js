// kg-visualizer.js - JavaScript for Knowledge Graph Visualization

let network = null;
let currentData = null;
let eventsIndex = [];
let nodesData = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadEventsIndex();
    initializeEventSelector();
    initializeModals();
    initializeNodeToggle();
});

// Load the index.json file with all events
async function loadEventsIndex() {
    try {
        console.log('Attempting to load index.json...');
        const response = await fetch('index.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        eventsIndex = await response.json();
        console.log(`Successfully loaded ${eventsIndex.length} events`);
        populateEventDropdown();
    } catch (error) {
        console.error('Error loading events index:', error);
        document.getElementById('eventSelect').innerHTML = '<option value="">Error loading events - check console</option>';
    }
}

// Populate dropdown with events
function populateEventDropdown() {
    const select = document.getElementById('eventSelect');
    
    if (eventsIndex.length === 0) {
        select.innerHTML = '<option value="">No events available</option>';
        return;
    }
    
    select.innerHTML = '<option value="">-- Select an event --</option>';
    
    eventsIndex.forEach(event => {
        const option = document.createElement('option');
        option.value = event.file;
        option.textContent = `${event.DisNo} - ${event.disaster_type} in ${event.country} (${event.start_dt})`;
        select.appendChild(option);
    });
}

// Initialize event selector
function initializeEventSelector() {
    const select = document.getElementById('eventSelect');
    
    select.addEventListener('change', async function() {
        const filename = this.value;
        if (!filename) return;
        
        try {
            console.log(`Loading event data: data/${filename}`);
            const response = await fetch(`data/${filename}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            currentData = data;
            visualizeKnowledgeGraph(data);
        } catch (error) {
            console.error('Error loading event:', error);
            alert('Error loading event data: ' + error.message);
        }
    });
}

// Initialize node toggle
function initializeNodeToggle() {
    const checkbox = document.getElementById('showNodes');
    checkbox.addEventListener('change', function() {
        if (currentData) {
            visualizeKnowledgeGraph(currentData);
        }
    });
}

// Visualize the knowledge graph
function visualizeKnowledgeGraph(data) {
    // Hide no-data message
    document.getElementById('noData').style.display = 'none';
    
    // Show event info and legend
    document.getElementById('eventInfo').classList.add('active');
    document.getElementById('legend').style.display = 'block';

    // Update event info
    updateEventInfo(data);

    const kgData = data.knowledge_graph_with_citations || [];
    const nodesWithCitations = data.nodes_with_citations || [];

    // Create lookup for node data
    nodesData = {};
    nodesWithCitations.forEach(nodeItem => {
        nodesData[nodeItem.node] = nodeItem;
    });

    console.log('Nodes with citations:', Object.keys(nodesData).length);

    // Extract nodes and edges
    const { nodes, edges } = extractGraphElements(kgData);

    // Update stats
    updateStats(nodes.length, edges.length, data);

    // Create network visualization
    createNetwork(nodes, edges);
}

// Update event information display
function updateEventInfo(data) {
    document.getElementById('infoDisNo').textContent = data.DisNo || 'N/A';
    document.getElementById('infoType').textContent = data.disaster_type || 'N/A';
    document.getElementById('infoCountry').textContent = data.country || 'N/A';
    document.getElementById('infoLocation').textContent = data.location || 'N/A';
    document.getElementById('infoDate').textContent = data.start_dt || 'N/A';
}

// Extract nodes and edges from KG data
function extractGraphElements(kgData) {
    const nodesSet = new Set();
    const edges = [];

    kgData.forEach((item, idx) => {
        nodesSet.add(item.source);
        nodesSet.add(item.target);

        const nCitations = item.n_citations || 0;
        let color = getEdgeColor(nCitations);

        edges.push({
            id: idx,
            from: item.source,
            to: item.target,
            label: item.relation,
            color: { color: color },
            width: 2 + nCitations,
            font: { size: 14, align: 'middle', color: '#2c3e50' },
            arrows: { to: { enabled: true, scaleFactor: 0.6 } },
            smooth: { enabled: true, type: 'continuous' },
            data: item
        });
    });

    // Create nodes array with conditional styling
    const showNodeDetails = document.getElementById('showNodes').checked;
    const nodes = Array.from(nodesSet).map(node => {
        const nodeInfo = nodesData[node];
        const nCitations = nodeInfo ? (nodeInfo.n_citations || 0) : 0;
        
        let nodeColor, nodeSize;
        if (showNodeDetails && nodeInfo) {
            nodeColor = getNodeColor(nCitations);
            nodeSize = 25 + (nCitations * 3);
        } else {
            nodeColor = {
                background: '#97c2fc',
                border: '#2B7CE9',
                highlight: { background: '#D2E5FF', border: '#2B7CE9' }
            };
            nodeSize = 25;
        }

        return {
            id: node,
            label: node,
            color: nodeColor,
            font: { size: 16, color: '#2c3e50' },
            shape: 'dot',
            size: nodeSize,
            data: nodeInfo
        };
    });

    return { nodes, edges };
}

// Get edge color based on number of citations
function getEdgeColor(nCitations) {
    if (nCitations >= 3) return '#2ecc71'; // Green
    if (nCitations >= 1) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
}

// Get node color based on number of citations
function getNodeColor(nCitations) {
    if (nCitations >= 3) {
        return {
            background: '#3498db',
            border: '#2980b9',
            highlight: { background: '#5dade2', border: '#2980b9' }
        };
    }
    if (nCitations >= 1) {
        return {
            background: '#9b59b6',
            border: '#8e44ad',
            highlight: { background: '#bb8fce', border: '#8e44ad' }
        };
    }
    return {
        background: '#95a5a6',
        border: '#7f8c8d',
        highlight: { background: '#bdc3c7', border: '#7f8c8d' }
    };
}

// Update statistics display
function updateStats(nodeCount, edgeCount, data) {
    document.getElementById('statNodes').textContent = nodeCount;
    document.getElementById('statEdges').textContent = edgeCount;
    
    const totalCitations = (data.total_citations || 0) + (data.total_node_citations || 0);
    document.getElementById('statCitations').textContent = totalCitations;
    document.getElementById('statArticles').textContent = data.n_articles || 0;
}

// Create the network visualization
function createNetwork(nodes, edges) {
    const container = document.getElementById('network');
    const graphData = { nodes: nodes, edges: edges };
    
    const options = {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -8000,
                centralGravity: 0.3,
                springLength: 200,
                springConstant: 0.04,
                damping: 0.09
            },
            stabilization: {
                iterations: 150
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 100,
            navigationButtons: true,
            keyboard: true
        }
    };

    // Destroy existing network if present
    if (network) {
        network.destroy();
    }

    network = new vis.Network(container, graphData, options);

    // Add click event for edges and nodes - IMPROVED VERSION
    network.on('click', function(params) {
        console.log('Click event:', params);
        
        // Check if a node was clicked FIRST (nodes take priority over edges)
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            console.log('Node clicked:', nodeId);
            const node = nodes.find(n => n.id === nodeId);
            
            if (node) {
                console.log('Node data:', node.data);
                if (node.data) {
                    showNodeModal(node.data);
                } else {
                    // If no detailed data, show basic info
                    showNodeModalBasic(nodeId);
                }
            }
        } 
        // Only check edges if no node was clicked
        else if (params.edges.length > 0) {
            const edgeId = params.edges[0];
            console.log('Edge clicked:', edgeId);
            const edge = edges.find(e => e.id === edgeId);
            if (edge) {
                showEdgeModal(edge.data);
            }
        }
    });

    // Alternative: Add double-click event for nodes as backup
    network.on('doubleClick', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = nodes.find(n => n.id === nodeId);
            if (node && node.data) {
                showNodeModal(node.data);
            } else {
                showNodeModalBasic(nodeId);
            }
        }
    });
}

// Show modal with edge details (question, answer, citations)
function showEdgeModal(edgeData) {
    const modal = document.getElementById('edgeModal');
    
    // Set relation title
    document.getElementById('modalRelation').textContent = 
        `${edgeData.source} → ${edgeData.relation} → ${edgeData.target}`;
    
    // Set question
    document.getElementById('modalQuestion').textContent = edgeData.question || 'N/A';
    
    // Set answer with clickable citations
    const answerDiv = document.getElementById('modalAnswer');
    answerDiv.innerHTML = processCitationsInText(
        escapeHtml(edgeData.answer || 'No answer available'),
        edgeData.citations || []
    );
    
    // Set citations
    const citations = edgeData.citations || [];
    const citationsSection = document.getElementById('citationsSection');
    const citationsContainer = document.getElementById('modalCitations');
    
    if (citations.length > 0) {
        citationsSection.style.display = 'block';
        document.getElementById('citationCount').textContent = citations.length;
        
        citationsContainer.innerHTML = citations.map((cit, idx) => {
            const title = cit.metadata?.title || 'No title';
            const content = cit.content ? cit.content.substring(0, 150) + '...' : 'No content';
            
            return `
                <div class="citation-item" data-citation-index="${idx}">
                    <span class="citation-number">[${cit.source_id}]</span>
                    <span class="citation-text"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(content)}</span>
                </div>
            `;
        }).join('');
        
        // Add click handlers to citation items
        citationsContainer.querySelectorAll('.citation-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-citation-index'));
                showCitationModal(citations[index]);
            });
        });
    } else {
        citationsSection.style.display = 'none';
    }
    
    // Add click handlers to inline citations in answer
    answerDiv.querySelectorAll('.citation').forEach(span => {
        span.addEventListener('click', function(e) {
            e.stopPropagation();
            const citId = parseInt(this.textContent.replace(/[\[\]]/g, ''));
            const citation = citations.find(c => c.source_id === citId);
            if (citation) {
                showCitationModal(citation);
            }
        });
    });
    
    modal.style.display = 'block';
}

// Show modal with node details
function showNodeModal(nodeData) {
    const modal = document.getElementById('nodeModal');
    
    // Set node title
    document.getElementById('modalNodeTitle').textContent = nodeData.node || 'Node Details';
    
    // Set question
    document.getElementById('modalNodeQuestion').textContent = nodeData.question || 'N/A';
    
    // Set answer with clickable citations
    const answerDiv = document.getElementById('modalNodeAnswer');
    answerDiv.innerHTML = processCitationsInText(
        escapeHtml(nodeData.answer || 'No answer available'),
        nodeData.citations || []
    );
    
    // Set citations
    const citations = nodeData.citations || [];
    const citationsSection = document.getElementById('nodeCitationsSection');
    const citationsContainer = document.getElementById('modalNodeCitations');
    
    if (citations.length > 0) {
        citationsSection.style.display = 'block';
        document.getElementById('nodeCitationCount').textContent = citations.length;
        
        citationsContainer.innerHTML = citations.map((cit, idx) => {
            const title = cit.metadata?.title || 'No title';
            const content = cit.content ? cit.content.substring(0, 150) + '...' : 'No content';
            
            return `
                <div class="citation-item" data-citation-index="${idx}">
                    <span class="citation-number">[${cit.source_id}]</span>
                    <span class="citation-text"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(content)}</span>
                </div>
            `;
        }).join('');
        
        // Add click handlers to citation items
        citationsContainer.querySelectorAll('.citation-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-citation-index'));
                showCitationModal(citations[index]);
            });
        });
    } else {
        citationsSection.style.display = 'none';
    }
    
    // Add click handlers to inline citations in answer
    answerDiv.querySelectorAll('.citation').forEach(span => {
        span.addEventListener('click', function(e) {
            e.stopPropagation();
            const citId = parseInt(this.textContent.replace(/[\[\]]/g, ''));
            const citation = citations.find(c => c.source_id === citId);
            if (citation) {
                showCitationModal(citation);
            }
        });
    });
    
    modal.style.display = 'block';
}

// Show basic node modal when no detailed data is available
function showNodeModalBasic(nodeId) {
    const modal = document.getElementById('nodeModal');
    
    document.getElementById('modalNodeTitle').textContent = nodeId;
    document.getElementById('modalNodeQuestion').textContent = 'No detailed information available for this node';
    document.getElementById('modalNodeAnswer').textContent = 'Enable "Show Node Details" to see citation information, or this node may not have detailed documentation.';
    document.getElementById('nodeCitationsSection').style.display = 'none';
    
    modal.style.display = 'block';
}

// Process text to make citations clickable
function processCitationsInText(text, citations) {
    if (!text || !citations || citations.length === 0) return text;
    
    const citationRegex = /\[(\d+)\]/g;
    return text.replace(citationRegex, (match, citationId) => {
        const cit = citations.find(c => c.source_id === parseInt(citationId));
        if (cit) {
            return `<span class="citation" data-citation-id="${citationId}">[${citationId}]</span>`;
        }
        return match;
    });
}

// Show citation detail modal
function showCitationModal(citation) {
    const modal = document.getElementById('citationModal');
    
    document.getElementById('citationContext').textContent = 
        citation.content || 'No content available';
    document.getElementById('citationTitle').textContent = 
        citation.metadata?.title || 'No title available';
    
    const url = citation.metadata?.url || '';
    document.getElementById('citationUrl').textContent = url || 'No URL provided';
    document.getElementById('citationUrl').href = url || '#';
    
    modal.style.display = 'block';
}

// Initialize modal close handlers
function initializeModals() {
    // Edge modal
    const edgeModal = document.getElementById('edgeModal');
    const edgeClose = edgeModal.querySelector('.close');
    
    edgeClose.addEventListener('click', () => {
        edgeModal.style.display = 'none';
    });
    
    // Node modal
    const nodeModal = document.getElementById('nodeModal');
    const nodeClose = nodeModal.querySelector('.node-close');
    
    nodeClose.addEventListener('click', () => {
        nodeModal.style.display = 'none';
    });
    
    // Citation modal
    const citationModal = document.getElementById('citationModal');
    const citationClose = citationModal.querySelector('.citation-close');
    
    citationClose.addEventListener('click', () => {
        citationModal.style.display = 'none';
    });
    
    // Click outside to close
    window.addEventListener('click', (event) => {
        if (event.target === edgeModal) {
            edgeModal.style.display = 'none';
        }
        if (event.target === nodeModal) {
            nodeModal.style.display = 'none';
        }
        if (event.target === citationModal) {
            citationModal.style.display = 'none';
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            edgeModal.style.display = 'none';
            nodeModal.style.display = 'none';
            citationModal.style.display = 'none';
        }
    });
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
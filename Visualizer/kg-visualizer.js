// kg-visualizer.js - JavaScript for Knowledge Graph Visualization with Custom Queries

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';

let network = null;
let currentData = null;
let eventsIndex = [];
let nodesData = {};

// RAG Components
let embedder = null;
let embeddingsData = null;
let currentEventId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadEventsIndex();
    initializeEventSelector();
    initializeModals();
    initializeNodeToggle();
    initializeQueryPanel();
});

// ============================================================================
// RAG PIPELINE - Custom Query System
// ============================================================================

async function initializeQueryPanel() {
    const toggleBtn = document.getElementById('toggleQueryPanel');
    const queryPanel = document.getElementById('queryPanel');
    const closeBtn = document.getElementById('closeQueryPanel');
    const submitBtn = document.getElementById('submitQuery');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const apiKeyInput = document.getElementById('apiKey');

    // Toggle panel visibility
    toggleBtn.addEventListener('click', () => {
        queryPanel.style.display = queryPanel.style.display === 'none' ? 'block' : 'none';
    });

    closeBtn.addEventListener('click', () => {
        queryPanel.style.display = 'none';
    });

    // Toggle API key visibility
    toggleApiKeyBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyBtn.textContent = '👁️';
        }
    });

    // Load API key from session storage
    const savedApiKey = sessionStorage.getItem('openai_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }

    // Save API key to session storage on change
    apiKeyInput.addEventListener('change', () => {
        sessionStorage.setItem('openai_api_key', apiKeyInput.value);
    });

    // Submit query
    submitBtn.addEventListener('click', handleCustomQuery);

    // Allow Enter key in textarea (with Ctrl/Cmd)
    document.getElementById('userQuery').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleCustomQuery();
        }
    });
}

async function handleCustomQuery() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const query = document.getElementById('userQuery').value.trim();
    const statusDiv = document.getElementById('queryStatus');
    const resultsDiv = document.getElementById('queryResults');
    const submitBtn = document.getElementById('submitQuery');

    // Validation
    if (!apiKey) {
        statusDiv.innerHTML = '<span style="color: #e74c3c;">⚠️ Please enter your OpenAI API key</span>';
        return;
    }

    if (!query) {
        statusDiv.innerHTML = '<span style="color: #e74c3c;">⚠️ Please enter a question</span>';
        return;
    }

    if (!currentEventId) {
        statusDiv.innerHTML = '<span style="color: #e74c3c;">⚠️ Please select an event first</span>';
        return;
    }

    // Show loading state
    submitBtn.querySelector('.btn-text').style.display = 'none';
    submitBtn.querySelector('.btn-loading').style.display = 'inline-flex';
    submitBtn.disabled = true;
    statusDiv.innerHTML = '';
    resultsDiv.style.display = 'none';

    try {
        // Step 1: Load embedder if not already loaded
        if (!embedder) {
            statusDiv.innerHTML = '<span style="color: #3498db;">📦 Loading embedding model (first time only)...</span>';
            embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
            console.log('✅ Embedder loaded');
        }

        // Step 2: Load embeddings if not already loaded or if event changed
        if (!embeddingsData || embeddingsData.eventId !== currentEventId) {
            statusDiv.innerHTML = '<span style="color: #3498db;">📊 Loading document embeddings...</span>';
            embeddingsData = await loadEmbeddings(currentEventId);
            console.log(`✅ Loaded ${embeddingsData.documents.length} documents`);
        }

        // Step 3: Retrieve relevant documents
        statusDiv.innerHTML = '<span style="color: #3498db;">🔍 Searching relevant documents...</span>';
        const retrievedDocs = await retrieveDocuments(query, embeddingsData, 10);
        console.log(`✅ Retrieved ${retrievedDocs.length} documents`);

        // Step 4: Generate answer with OpenAI
        statusDiv.innerHTML = '<span style="color: #3498db;">🤖 Generating answer with citations...</span>';
        const result = await generateAnswerWithCitations(query, retrievedDocs, apiKey);
        
        // Step 5: Display results
        displayQueryResults(result, retrievedDocs);
        statusDiv.innerHTML = '<span style="color: #2ecc71;">✅ Answer generated successfully!</span>';

    } catch (error) {
        console.error('Error processing query:', error);
        statusDiv.innerHTML = `<span style="color: #e74c3c;">❌ Error: ${error.message}</span>`;
    } finally {
        // Reset button state
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loading').style.display = 'none';
        submitBtn.disabled = false;
    }
}

async function loadEmbeddings(eventId) {
    try {
        const response = await fetch(`embeddings/${eventId}_embeddings.json`);
        if (!response.ok) {
            throw new Error(`Failed to load embeddings: ${response.status}`);
        }
        const data = await response.json();
        data.eventId = eventId; // Add event ID to track which event this is for
        return data;
    } catch (error) {
        throw new Error(`Could not load embeddings for this event. Make sure embeddings are generated and uploaded.`);
    }
}

async function retrieveDocuments(query, embeddingsData, topK = 10) {
    // Generate query embedding
    const output = await embedder(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data);

    // Compute cosine similarities
    const scores = embeddingsData.embeddings.map(docEmbedding => 
        cosineSimilarity(queryEmbedding, docEmbedding)
    );

    // Get top-k indices
    const indexedScores = scores.map((score, idx) => ({ score, idx }));
    indexedScores.sort((a, b) => b.score - a.score);
    const topIndices = indexedScores.slice(0, topK).map(item => item.idx);

    // Return top documents with scores
    return topIndices.map((idx, rank) => ({
        content: embeddingsData.documents[idx].content,
        metadata: embeddingsData.documents[idx].metadata,
        score: scores[idx],
        sourceId: rank + 1
    }));
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateAnswerWithCitations(query, retrievedDocs, apiKey) {
    // Format context with sources (matching Python format)
    const context = retrievedDocs.map((doc, idx) => {
        let text = `Source ${idx + 1}:\n`;
        if (doc.metadata.title) {
            text += `Title: ${doc.metadata.title}\n`;
        }
        if (doc.metadata.url) {
            text += `URL: ${doc.metadata.url}\n`;
        }
        text += `Content: ${doc.content}\n`;
        return text;
    }).join('\n');

    // Prompt template (matching your Python RAG template)
    const prompt = `**Role:** You are an expert AI assistant specializing in disaster analysis.

**Task:**
1. Analyze the source documents provided.
2. Write a SHORT answer (2-3 sentences maximum) about the question using ONLY information from these sources.
3. EVERY factual statement MUST be supported by citations.

**Citation Instructions:**
* Place citations [Source Number] immediately after each sentence or claim.
* If multiple sources support the same claim, cite all: [1][2][3]
* Use source numbers corresponding to the provided sources.

**Context:**
${context}

**Query:** 
${query}

**Short Answer (2-3 sentences with citations):**`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            temperature: 0,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    // Extract citations from answer
    const citations = extractCitations(answer, retrievedDocs);

    // Renumber citations
    const { renumberedAnswer, mapping } = renumberCitations(answer);

    // Reorder citations based on mapping
    const reorderedCitations = reorderCitations(citations, mapping);

    return {
        answer: renumberedAnswer,
        citations: reorderedCitations,
        rawAnswer: answer
    };
}

function extractCitations(answer, retrievedDocs) {
    const citationPattern = /\[(\d+)\]/g;
    const citedSources = new Set();
    let match;

    while ((match = citationPattern.exec(answer)) !== null) {
        citedSources.add(parseInt(match[1]));
    }

    const citations = [];
    Array.from(citedSources).sort((a, b) => a - b).forEach(sourceNum => {
        if (sourceNum <= retrievedDocs.length) {
            const doc = retrievedDocs[sourceNum - 1];
            citations.push({
                source_id: sourceNum,
                content: doc.content,
                metadata: doc.metadata
            });
        }
    });

    return citations;
}

function renumberCitations(answer) {
    const citationPattern = /\[(\d+)\]/g;
    const citationsFound = [];
    let match;

    while ((match = citationPattern.exec(answer)) !== null) {
        citationsFound.push(parseInt(match[1]));
    }

    const oldToNew = {};
    let newCounter = 1;

    citationsFound.forEach(oldNum => {
        if (!(oldNum in oldToNew)) {
            oldToNew[oldNum] = newCounter++;
        }
    });

    const renumberedAnswer = answer.replace(citationPattern, (match, oldNum) => {
        const num = parseInt(oldNum);
        return `[${oldToNew[num] || num}]`;
    });

    return { renumberedAnswer, mapping: oldToNew };
}

function reorderCitations(citations, mapping) {
    const newCitations = new Array(Object.keys(mapping).length);

    citations.forEach(citation => {
        const oldId = citation.source_id;
        if (oldId in mapping) {
            const newId = mapping[oldId];
            const newCitation = { ...citation, source_id: newId };
            newCitations[newId - 1] = newCitation;
        }
    });

    return newCitations.filter(c => c !== undefined);
}

function displayQueryResults(result, retrievedDocs) {
    const resultsDiv = document.getElementById('queryResults');
    const answerBox = document.getElementById('answerBox');
    const retrievedDocsSection = document.getElementById('retrievedDocsSection');
    const retrievedDocsDiv = document.getElementById('retrievedDocs');
    const sourceCount = document.getElementById('sourceCount');

    // Display answer with clickable citations
    answerBox.innerHTML = processCitationsInText(
        escapeHtml(result.answer),
        result.citations
    );

    // Add click handlers to citations in answer
    answerBox.querySelectorAll('.citation').forEach(span => {
        span.addEventListener('click', function(e) {
            e.stopPropagation();
            const citId = parseInt(this.textContent.replace(/[\[\]]/g, ''));
            const citation = result.citations.find(c => c.source_id === citId);
            if (citation) {
                showCitationModal(citation);
            }
        });
    });

    // Display retrieved documents
    if (result.citations.length > 0) {
        retrievedDocsSection.style.display = 'block';
        sourceCount.textContent = result.citations.length;

        retrievedDocsDiv.innerHTML = result.citations.map((cit, idx) => {
            const title = cit.metadata?.title || 'No title';
            const content = cit.content ? cit.content.substring(0, 200) + '...' : 'No content';

            return `
                <div class="citation-item" data-citation-index="${idx}">
                    <span class="citation-number">[${cit.source_id}]</span>
                    <span class="citation-text">
                        <strong>${escapeHtml(title)}</strong><br>
                        ${escapeHtml(content)}
                    </span>
                </div>
            `;
        }).join('');

        // Add click handlers to citation items
        retrievedDocsDiv.querySelectorAll('.citation-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-citation-index'));
                showCitationModal(result.citations[index]);
            });
        });
    } else {
        retrievedDocsSection.style.display = 'none';
    }

    resultsDiv.style.display = 'block';
}

// ============================================================================
// ORIGINAL VISUALIZATION CODE
// ============================================================================

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
        option.dataset.disno = event.DisNo;
        select.appendChild(option);
    });
}

// Initialize event selector
function initializeEventSelector() {
    const select = document.getElementById('eventSelect');
    
    select.addEventListener('change', async function() {
        const filename = this.value;
        if (!filename) return;

        // Get DisNo from selected option
        const selectedOption = this.options[this.selectedIndex];
        currentEventId = selectedOption.dataset.disno;
        
        try {
            console.log(`Loading event data: data/${filename}`);
            const response = await fetch(`data/${filename}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            currentData = data;
            visualizeKnowledgeGraph(data);

            // Reset embeddings data when event changes
            embeddingsData = null;
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

    // Add click event for edges and nodes
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = nodes.find(n => n.id === nodeId);
            
            if (node) {
                if (node.data) {
                    showNodeModal(node.data);
                } else {
                    showNodeModalBasic(nodeId);
                }
            }
        } 
        else if (params.edges.length > 0) {
            const edgeId = params.edges[0];
            const edge = edges.find(e => e.id === edgeId);
            if (edge) {
                showEdgeModal(edge.data);
            }
        }
    });

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

// Show modal with edge details
function showEdgeModal(edgeData) {
    const modal = document.getElementById('edgeModal');
    
    document.getElementById('modalRelation').textContent = 
        `${edgeData.source} → ${edgeData.relation} → ${edgeData.target}`;
    
    document.getElementById('modalQuestion').textContent = edgeData.question || 'N/A';
    
    const answerDiv = document.getElementById('modalAnswer');
    answerDiv.innerHTML = processCitationsInText(
        escapeHtml(edgeData.answer || 'No answer available'),
        edgeData.citations || []
    );
    
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
        
        citationsContainer.querySelectorAll('.citation-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-citation-index'));
                showCitationModal(citations[index]);
            });
        });
    } else {
        citationsSection.style.display = 'none';
    }
    
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
    
    document.getElementById('modalNodeTitle').textContent = nodeData.node || 'Node Details';
    document.getElementById('modalNodeQuestion').textContent = nodeData.question || 'N/A';
    
    const answerDiv = document.getElementById('modalNodeAnswer');
    answerDiv.innerHTML = processCitationsInText(
        escapeHtml(nodeData.answer || 'No answer available'),
        nodeData.citations || []
    );
    
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
        
        citationsContainer.querySelectorAll('.citation-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-citation-index'));
                showCitationModal(citations[index]);
            });
        });
    } else {
        citationsSection.style.display = 'none';
    }
    
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

// Show basic node modal
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
    const edgeModal = document.getElementById('edgeModal');
    const edgeClose = edgeModal.querySelector('.close');
    
    edgeClose.addEventListener('click', () => {
        edgeModal.style.display = 'none';
    });
    
    const nodeModal = document.getElementById('nodeModal');
    const nodeClose = nodeModal.querySelector('.node-close');
    
    nodeClose.addEventListener('click', () => {
        nodeModal.style.display = 'none';
    });
    
    const citationModal = document.getElementById('citationModal');
    const citationClose = citationModal.querySelector('.citation-close');
    
    citationClose.addEventListener('click', () => {
        citationModal.style.display = 'none';
    });
    
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
    
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            edgeModal.style.display = 'none';
            nodeModal.style.display = 'none';
            citationModal.style.display = 'none';
        }
    });
}

// Escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
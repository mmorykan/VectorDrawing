/**
 * Vector Drawing Program
 * Authors: Jonah Beers and Mark Morykan
 */

'use strict';

// Global WebGL context variable
let gl;

// Stores objects containing drawing mode and vertex length for that mode
let drawingHistory = [];

// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Initialize byte offsets
    gl.currentCoordByteOffset = 0;
    gl.currentColorByteOffset = 0;

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height); // this is the region of the canvas we want to draw on (all of it)
    gl.clearColor(1.0, 1.0, 1.0, 0.0); // setup the background color with red, green, blue, and alpha

    // Initialize the WebGL program, buffers, and events
    gl.program = initProgram();
    initBuffers();
    initEvents();

    // Render the scene
    render();
});


/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader: simplest possible
    let vertShader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        in vec4 aPosition;
        in vec4 aColor;

        out vec4 vColor;
        
        void main() {
            gl_Position = aPosition;
            gl_PointSize = 5.0; // make points visible
            vColor = aColor;
        }`
    );
    // Fragment Shader: simplest possible, chosen color is red for each point
    let fragShader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        in vec4 vColor;
        out vec4 fragColor;

        void main() {
            fragColor = vColor;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vertShader, fragShader);
    gl.useProgram(program);
    
    // Get and save the position and color attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.aColor = gl.getAttribLocation(program, 'aColor'); // get the vertex shader attribute "aColor"
    
    return program;
}


/**
 * Initialize the data buffers. This allocates a vertex array containing two array buffers:
 *   * For aPosition, 100000 2-component floats
 *   * For aColor, 100000 3-component floats
 * Both are setup for dynamic drawing.
 */
function initBuffers() {
    // Create and bind VAO
    gl.vectorsVAO = gl.createVertexArray();
    gl.bindVertexArray(gl.vectorsVAO);

    // Load the vertex coordinate data onto the GPU and associate with attribute
    gl.posBuffer = gl.createBuffer(); // create position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer); // bind the position buffer
    gl.bufferData(gl.ARRAY_BUFFER, 100000*2*Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW); // load the data into the position buffer
    gl.vertexAttribPointer(gl.program.aPosition, 2, gl.FLOAT, false, 0, 0); // associate the buffer with "aPosition" as length-2 vectors of floats
    gl.enableVertexAttribArray(gl.program.aPosition); // enable this set of data

    // Load the vertex color data onto the GPU and associate with attribute
    gl.colorBuffer = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, 100000*3*Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(gl.program.aColor, 3, gl.FLOAT, false, 0, 0); // associate the buffer with "aColor" as length-3 vectors of floats
    gl.enableVertexAttribArray(gl.program.aColor);
    
    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


/**
 * Initialize the event handlers and initialize any global variables based on the current values
 * in the HTML inputs.
 */
function initEvents() {
    // Drawing mode event handler/listener and set initial value
    const mode = document.getElementById('draw-mode');
    gl.drawingMode = mode.value;
    mode.addEventListener('change', function changeMode() { gl.drawingMode = this.value; });

    // Color event listener/handler and convert colors from hex to rgb (0 to 1)
    const color = document.getElementById('draw-color');
    gl.drawingColor = hexToRgb(color.value);
    color.addEventListener('change', function changeColor() { gl.drawingColor = hexToRgb(this.value); });

    // Canvas click event listener
    document.getElementById('webgl-canvas').addEventListener('click', addVertex);
    // Download button event listener
    document.getElementById("download").addEventListener('click', downloadDrawing);
    // Upload button event listener
    document.getElementById("upload").addEventListener('change', uploadDrawing);
}


/**
 * Render the scene. This goes through each shape and draws its vertices using the appropriate
 * mode and range of vertices.
 */
function render() {
    // Bind VAO
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(gl.vectorsVAO);

    // Iterate through the drawing history
    let startingIndexPerMode = 0;
    drawingHistory.forEach(drawingMode => {
        // Draw using the current mode for the number of vertices saved 
        gl.drawArrays(gl[drawingMode.mode], startingIndexPerMode, drawingMode.vertLength);
        startingIndexPerMode += drawingMode.vertLength; // Update buffer offset 
    });

    // Cleanup
    gl.bindVertexArray(null);
}


/**
 * Event handler for converting window coordinates to clip coordinates, adding them to the 
 * appropriate buffers, and updating the drawing history and byte offsets.
 */
function addVertex(e) {
    let [x, y, w, h] = [e.offsetX, e.offsetY, this.offsetWidth, this.offsetHeight];
    
    // Convert x and y from window coordinates (pixels) to clip coordinates (-1,-1 to 1,1)
    let xy = [(2 * x) / w - 1, 1 - (2 * y) / h];

    /** 
     * Gets the previous object in drawingHistory if the current mode is the same as the previouse mode,
     * otherwise pushes new object on with the current drawing mode.
     */
    if (drawingHistory.length === 0 || gl.drawingMode !== drawingHistory[drawingHistory.length - 1].mode) {
        drawingHistory.push({mode: gl.drawingMode, vertLength: 0}); 
    }
    drawingHistory[drawingHistory.length - 1].vertLength += 1; // Add one to the vertex count for the current mode

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, gl.currentCoordByteOffset, Float32Array.from(xy)); // Add new vertex to buffer
    
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer); 
    gl.bufferSubData(gl.ARRAY_BUFFER, gl.currentColorByteOffset, Float32Array.from(gl.drawingColor)); // Add new color to buffer   

    // Cleanup
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Update offsets
    gl.currentCoordByteOffset += 2*Float32Array.BYTES_PER_ELEMENT;
    gl.currentColorByteOffset += 3*Float32Array.BYTES_PER_ELEMENT;

    render();
}


/**
 * Converts the color's hex value to RGB, then divides by 255 to return 
 * the RGB values between 0 and 1.
 */
function hexToRgb(hexValue) {
    return [
        parseInt(hexValue.substr(1, 2), 16) / 255, // compute "R" value
        parseInt(hexValue.substr(3, 2), 16) / 255, // compute "G" value
        parseInt(hexValue.substr(5, 2), 16) / 255,  // compute "B" value
    ];
}


/**
 * Event handler for the download button where the user can download their drawing history 
 * as a JSON file in order to upload later
 */
function downloadDrawing() {
    // Create Float arrays whose sizes are the amounts of vertices and colors we have
    let vertices = new Float32Array(gl.currentCoordByteOffset / Float32Array.BYTES_PER_ELEMENT);
    let colors = new Float32Array(gl.currentColorByteOffset / Float32Array.BYTES_PER_ELEMENT);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, vertices); // Retrieve the vertices from the position buffer and store them in a float array

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, colors);// Retrieve the colors from the color buffer and store them in a float array

    // Push the vertex and color arrays onto the drawing history
    drawingHistory.push(vertices, colors);

    // Create and click a link, saving the drawing history in a JSON file
    let downloadLink = document.createElement("a");
    downloadLink.download = prompt("Enter file name:") + ".json";
    downloadLink.href = URL.createObjectURL(new Blob([JSON.stringify(drawingHistory)]));
    downloadLink.click();
 
    // Cleanup
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


/**
 * Saves the drawing history and vertex/color data from the user's uploaded JSON file.
 * Once saved, the drawing history is rendered to display the user's drawing.
 */
function uploadDrawing() {
    let file = this.files[0]; // Gets the uploaded file

    if (file) { // If file exists
        let reader = new FileReader();

        // Sets up event listener and executes event handler once readAsText is complete
        reader.addEventListener('load', () => {
            drawingHistory = JSON.parse(reader.result);
            let colors = Object.values(drawingHistory.pop()); // Pops color data from end of history
            let vertices = Object.values(drawingHistory.pop()); // Pops vertex data from end of history

            // Add vertices to position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, Float32Array.from(vertices));

            // Add colors to color buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, Float32Array.from(colors));

            // Update byte offsets
            gl.currentCoordByteOffset = vertices.length * Float32Array.BYTES_PER_ELEMENT;
            gl.currentColorByteOffset = colors.length * Float32Array.BYTES_PER_ELEMENT;

            // Set drawing history and render drawing
            render();
        });
        reader.readAsText(file);
    }
}

import React, { useRef, useEffect } from 'react';
import { mat4 } from 'gl-matrix';
import { Dimensions } from './widget/widgetInterfaces';

interface WebGLSpinningCubeProps {
  dimensions: Dimensions;
  render: boolean;
}

const WebGLSpinningCube: React.FC<WebGLSpinningCubeProps> = ({
  dimensions,
  render
}) => {
  if (!render) {
    return;
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }

    const gl = canvas.getContext('webgl', { alpha: true });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    /* Resize canvas to fit video dimensions */
    const resizeCanvasToDimensions = () => {
      canvas.style.width = `${dimensions.pixelWidth}px`;
      canvas.style.height = `${dimensions.pixelHeight}px`;
      canvas.style.left = `${dimensions.offsetX}px`;
      canvas.style.top = `${dimensions.offsetY}px`;

      canvas.width = dimensions.pixelWidth;
      canvas.height = dimensions.pixelHeight;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    };

    /* Initial resize and subsequent updates */
    resizeCanvasToDimensions();

    /* Vertex shader */
    const vertexShaderSource = `
      attribute vec4 a_position;
      attribute vec4 a_color;
      uniform mat4 u_matrix;
      varying vec4 v_color;
      void main() {
        gl_Position = u_matrix * a_position;
        v_color = a_color;
      }
    `;

    /* Fragment shader */
    const fragmentShaderSource = `
      precision mediump float;
      varying vec4 v_color;
      void main() {
        gl_FragColor = v_color;
      }
    `;

    /* Compile shaders */
    const compileShader = (
      source: string,
      type: number
    ): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Error compiling shader: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(
      fragmentShaderSource,
      gl.FRAGMENT_SHADER
    );

    if (!vertexShader || !fragmentShader) return;

    /* Create and link program */
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Error linking program: ${gl.getProgramInfoLog(program)}`);
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    /* Define cube vertices and colors */
    // prettier-ignore
    const vertices = new Float32Array([
      -1, -1,  1,   1, 0, 0,  // Bottom-left, red
       1, -1,  1,   0, 1, 0,  // Bottom-right, green
      -1,  1,  1,   0, 0, 1,  // Top-left, blue
       1,  1,  1,   1, 1, 0,  // Top-right, yellow
      -1, -1, -1,   1, 0, 1,  // Bottom-left, purple
       1, -1, -1,   0, 1, 1,  // Bottom-right, cyan
      -1,  1, -1,   1, 1, 1,  // Top-left, white
       1,  1, -1,   0.5, 0.5, 0.5 // Top-right, gray
    ]);

    // prettier-ignore
    const indices = new Uint16Array([
      0, 1, 2,  2, 1, 3, // Front face
      4, 5, 6,  6, 5, 7, // Back face
      0, 2, 4,  4, 2, 6, // Left face
      1, 3, 5,  5, 3, 7, // Right face
      2, 3, 6,  6, 3, 7, // Top face
      0, 1, 4,  4, 1, 5  // Bottom face
    ]);

    /* Create buffers */
    const positionBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!positionBuffer || !indexBuffer) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    /* Configure position attribute */
    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.vertexAttribPointer(
      aPosition,
      3,
      gl.FLOAT,
      false,
      6 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.enableVertexAttribArray(aPosition);

    /* Configure color attribute */
    const aColor = gl.getAttribLocation(program, 'a_color');
    gl.vertexAttribPointer(
      aColor,
      3,
      gl.FLOAT,
      false,
      6 * Float32Array.BYTES_PER_ELEMENT,
      3 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.enableVertexAttribArray(aColor);

    /* Get uniform locations */
    const uMatrix = gl.getUniformLocation(program, 'u_matrix');
    if (!uMatrix) return;

    /* Set up transformation matrices */
    const projectionMatrix = mat4.create();
    const modelMatrix = mat4.create();
    const viewMatrix = mat4.create();
    const modelViewProjectionMatrix = mat4.create();

    mat4.perspective(
      projectionMatrix,
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100
    );
    mat4.lookAt(viewMatrix, [3, 3, 5], [0, 0, 0], [0, 1, 0]);

    let angle = 0;

    const render = () => {
      angle += 0.01;
      mat4.identity(modelMatrix);
      mat4.rotateY(modelMatrix, modelMatrix, angle);
      mat4.rotateX(modelMatrix, modelMatrix, angle);

      mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);
      mat4.multiply(
        modelViewProjectionMatrix,
        modelViewProjectionMatrix,
        modelMatrix
      );

      gl.uniformMatrix4fv(uMatrix, false, modelViewProjectionMatrix);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

      requestAnimationFrame(render);
    };

    render();
  }, [dimensions]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
  );
};

export default WebGLSpinningCube;

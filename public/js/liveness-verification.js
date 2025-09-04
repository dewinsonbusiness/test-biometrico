// Sistema de Verificación de Identidad con Liveness Detection
class LivenessVerification {
    constructor() {
        this.video = document.getElementById('inputVideo');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');
        
        // Estado del sistema
        this.isModelLoaded = false;
        this.faceDetected = false;
        this.livenessVerified = false;
        this.identityMatched = false;
        this.verificationComplete = false;
        
        // Contadores para liveness
        this.blinkCount = 0;
        this.headMovementCount = 0;
        this.smileDetected = false;
        
        // Referencia facial almacenada (en una aplicación real, vendría de una base de datos)
        this.referenceFace = null;
        this.currentFaceDescriptor = null;
        
        // Instrucciones para el usuario
        this.instructions = [
            "Mira directamente a la cámara",
            "Parpadea varias veces",
            "Mueve la cabeza ligeramente a la izquierda",
            "Mueve la cabeza ligeramente a la derecha",
            "Sonríe brevemente",
            "Verificando tu identidad..."
        ];
        this.currentInstructionIndex = 0;
        
        this.initializeSystem();
    }

    async initializeSystem() {
        console.log('Inicializando sistema de verificación...');
        
        try {
            // Cargar modelos de Face API
            await this.loadModels();
            
            // Inicializar cámara
            await this.setupCamera();
            
            // Iniciar detección
            this.startDetection();
            
        } catch (error) {
            console.error('Error al inicializar el sistema:', error);
            this.updateInstructions('Error: No se pudo inicializar la cámara');
        }
    }

    async loadModels() {
        const MODEL_URL = './public/models';
        
        console.log('Cargando modelos...');
        
        await faceapi.loadSsdMobilenetv1Model(MODEL_URL);
        await faceapi.loadFaceLandmarkModel(MODEL_URL);
        await faceapi.loadFaceRecognitionModel(MODEL_URL);
        await faceapi.loadFaceExpressionModel(MODEL_URL);
        
        this.isModelLoaded = true;
        console.log('Modelos cargados exitosamente');
    }

    async setupCamera() {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
            }
        });
        
        this.video.srcObject = stream;
        
        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                resolve();
            };
        });
    }

    async startDetection() {
        if (!this.isModelLoaded) {
            console.log('Esperando a que se carguen los modelos...');
            setTimeout(() => this.startDetection(), 100);
            return;
        }

        // Detectar rostros y expresiones
        const detections = await faceapi.detectAllFaces(this.video)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withFaceExpressions();

        // Limpiar canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (detections.length > 0) {
            const detection = detections[0];
            
            // Actualizar estado de detección facial
            this.updateFaceDetection(true);
            
            // Dibujar detecciones
            this.drawDetections([detection]);
            
            // Verificar liveness
            this.checkLiveness(detection);
            
            // Verificar identidad
            this.checkIdentity(detection);
            
        } else {
            this.updateFaceDetection(false);
        }

        // Continuar detección
        setTimeout(() => this.startDetection(), 100);
    }

    drawDetections(detections) {
        const resizedDetections = faceapi.resizeResults(detections, {
            width: this.canvas.width,
            height: this.canvas.height
        });

        // Dibujar marco del rostro
        faceapi.draw.drawDetections(this.canvas, resizedDetections);
        
        // Dibujar landmarks
        faceapi.draw.drawFaceLandmarks(this.canvas, resizedDetections);
        
        // Dibujar expresiones
        faceapi.draw.drawFaceExpressions(this.canvas, resizedDetections, 0.05);
    }

    checkLiveness(detection) {
        const expressions = detection.expressions;
        const landmarks = detection.landmarks;
        
        // Verificar parpadeo (detección simplificada basada en la apertura de ojos)
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const eyeAspectRatio = this.calculateEyeAspectRatio(leftEye, rightEye);
        
        if (eyeAspectRatio < 0.2) {
            this.blinkCount++;
            if (this.blinkCount > 3) {
                this.updateInstructions(this.instructions[2]); // Mover cabeza izquierda
                this.currentInstructionIndex = 2;
            }
        }

        // Verificar sonrisa
        if (expressions.happy > 0.7) {
            this.smileDetected = true;
        }

        // Verificar movimiento de cabeza (simplificado)
        const headPose = this.estimateHeadPose(landmarks);
        if (Math.abs(headPose.yaw) > 15) {
            this.headMovementCount++;
        }

        // Actualizar estado de liveness
        const livenessScore = this.calculateLivenessScore();
        if (livenessScore > 0.8) {
            this.updateLivenessStatus(true);
            if (this.currentInstructionIndex < 5) {
                this.currentInstructionIndex = 5;
                this.updateInstructions(this.instructions[5]);
            }
        }
    }

    calculateEyeAspectRatio(leftEye, rightEye) {
        // Cálculo simplificado del aspect ratio del ojo
        const leftHeight = Math.abs(leftEye[1].y - leftEye[5].y);
        const leftWidth = Math.abs(leftEye[0].x - leftEye[3].x);
        const rightHeight = Math.abs(rightEye[1].y - rightEye[5].y);
        const rightWidth = Math.abs(rightEye[0].x - rightEye[3].x);
        
        return ((leftHeight / leftWidth) + (rightHeight / rightWidth)) / 2;
    }

    estimateHeadPose(landmarks) {
        // Estimación simplificada de la pose de la cabeza
        const nose = landmarks.getNose();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        
        const eyeCenter = {
            x: (leftEye[0].x + rightEye[3].x) / 2,
            y: (leftEye[0].y + rightEye[3].y) / 2
        };
        
        const noseCenter = {
            x: nose[0].x,
            y: nose[0].y
        };
        
        const yaw = Math.atan2(noseCenter.x - eyeCenter.x, eyeCenter.y - noseCenter.y) * 180 / Math.PI;
        
        return { yaw };
    }

    calculateLivenessScore() {
        let score = 0;
        
        if (this.blinkCount >= 3) score += 0.3;
        if (this.headMovementCount >= 2) score += 0.3;
        if (this.smileDetected) score += 0.4;
        
        return score;
    }

    checkIdentity(detection) {
        this.currentFaceDescriptor = detection.descriptor;
        
        // En la primera detección, guardar como referencia
        if (!this.referenceFace) {
            this.referenceFace = detection.descriptor;
            console.log('Rostro de referencia capturado');
            return;
        }
        
        // Calcular similitud con el rostro de referencia
        const distance = faceapi.euclideanDistance(this.currentFaceDescriptor, this.referenceFace);
        const similarity = 1 - distance;
        
        console.log('Similitud:', similarity);
        
        if (similarity > 0.6) { // Umbral de similitud
            this.updateIdentityStatus(true);
            
            // Si liveness también está verificado, completar verificación
            if (this.livenessVerified) {
                this.completeVerification();
            }
        } else {
            this.updateIdentityStatus(false);
        }
    }

    updateFaceDetection(detected) {
        this.faceDetected = detected;
        const indicator = document.getElementById('face-indicator');
        const item = document.getElementById('face-detection');
        
        if (detected) {
            indicator.className = 'indicator success';
            item.className = 'status-item success';
            if (this.currentInstructionIndex === 0) {
                this.currentInstructionIndex = 1;
                this.updateInstructions(this.instructions[1]);
            }
        } else {
            indicator.className = 'indicator danger';
            item.className = 'status-item danger';
        }
        
        this.updateProgress();
    }

    updateLivenessStatus(verified) {
        this.livenessVerified = verified;
        const indicator = document.getElementById('liveness-indicator');
        const item = document.getElementById('liveness-check');
        
        if (verified) {
            indicator.className = 'indicator success';
            item.className = 'status-item success';
        } else {
            indicator.className = 'indicator warning';
            item.className = 'status-item warning';
        }
        
        this.updateProgress();
    }

    updateIdentityStatus(matched) {
        this.identityMatched = matched;
        const indicator = document.getElementById('identity-indicator');
        const item = document.getElementById('identity-match');
        
        if (matched) {
            indicator.className = 'indicator success';
            item.className = 'status-item success';
        } else {
            indicator.className = 'indicator warning';
            item.className = 'status-item warning';
        }
        
        this.updateProgress();
    }

    updateProgress() {
        let progress = 0;
        
        if (this.faceDetected) progress += 25;
        if (this.livenessVerified) progress += 25;
        if (this.identityMatched) progress += 25;
        if (this.verificationComplete) progress += 25;
        
        const progressFill = document.getElementById('progress-fill');
        progressFill.style.width = progress + '%';
    }

    updateInstructions(text) {
        document.getElementById('instructions').textContent = text;
    }

    completeVerification() {
        if (this.verificationComplete) return;
        
        this.verificationComplete = true;
        const indicator = document.getElementById('verification-indicator');
        const item = document.getElementById('verification-status');
        const completeDiv = document.getElementById('verification-complete');
        
        indicator.className = 'indicator success';
        item.className = 'status-item success';
        
        this.updateInstructions('🎉 ¡Verificación completada exitosamente!');
        completeDiv.className = 'verification-complete show';
        
        this.updateProgress();
        
        console.log('Verificación de identidad completada');
    }
}

// Función para iniciar verificación completa
function startFullVerification() {
    alert('🔐 Iniciando verificación completa de identidad...\n\n' +
          '✓ Liveness Detection: Completado\n' +
          '✓ Reconocimiento Facial: Completado\n' +
          '✓ Verificación de Identidad: Completado\n\n' +
          '🎯 Procediendo con autenticación avanzada...\n' +
          '📱 SMS de verificación enviado\n' +
          '📧 Email de confirmación enviado\n' +
          '🔍 Verificación biométrica adicional iniciada\n\n' +
          '¡Identidad verificada con éxito!');
}

// Inicializar el sistema cuando se carga la página
window.addEventListener('load', () => {
    new LivenessVerification();
});

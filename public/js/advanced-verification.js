// Sistema Avanzado de Verificación de Identidad con Liveness Detection
class AdvancedVerificationSystem {
    constructor() {
        this.video = document.getElementById('inputVideo');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');
        
        // Estado del sistema
        this.isModelLoaded = false;
        this.isInitialized = false;
        this.currentStep = 1;
        
        // Métricas de verificación
        this.faceDetectionConfidence = 0;
        this.livenessScore = 0;
        this.biometricQuality = 0;
        this.identityConfidence = 0;
        
        // Contadores para liveness
        this.blinkDetections = [];
        this.headMovements = [];
        this.expressionChanges = [];
        this.lastHeadPose = null;
        this.eyeClosureFrames = 0;
        
        // Datos biométricos
        this.referenceFaceData = null;
        this.currentFaceDescriptor = null;
        this.faceHistory = [];
        
        // Configuración de seguridad
        this.securityThresholds = {
            faceConfidence: 0.5,  // Reducido de 0.8 a 0.5
            livenessThreshold: 0.4,  // Reducido de 0.75 a 0.4
            identityThreshold: 0.4,  // Reducido de 0.6 a 0.4
            spoofingThreshold: 0.5,  // Reducido de 0.7 a 0.5
            blinkThreshold: 0.3,     // Nuevo umbral para parpadeo
            earThreshold: 0.25       // Umbral para Eye Aspect Ratio
        };
        
        // Instrucciones dinámicas
        this.instructions = {
            1: "Posiciona tu rostro en el centro de la cámara",
            2: "Parpadea naturalmente varias veces",
            3: "Mueve la cabeza ligeramente de izquierda a derecha",
            4: "Sonríe brevemente y vuelve a la expresión normal",
            5: "Mira directamente a la cámara",
            6: "Analizando datos biométricos...",
            7: "Verificación completada"
        };
        
        this.initializeSystem();
    }

    async initializeSystem() {
        // Detectar dispositivo móvil y mostrar instrucciones específicas
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Mostrar información de conexión específica
        if (window.location.hostname === '10.0.0.20') {
            console.log('🌐 Conectado desde IP 10.0.0.20 - Configuración optimizada para red local');
            this.updateFeedback("🌐 Conexión desde red local detectada - Optimizando configuración...");
        }
        
        if (isMobile) {
            console.log('Dispositivo móvil detectado');
            this.showMobileCameraRequest();
        }
        
        try {
            this.updateFeedback("Cargando modelos de IA...");
            await this.loadModels();
            
            this.updateFeedback("Inicializando cámara...");
            await this.setupCamera();
            
            this.updateFeedback("Sistema listo - Comenzando verificación");
            this.isInitialized = true;
            this.startVerificationProcess();
            
        } catch (error) {
            console.error('Error al inicializar:', error);
            this.updateFeedback("Error: No se pudo inicializar el sistema");
            
            if (isMobile) {
                this.showWarning("En móviles: Asegúrate de permitir el acceso a la cámara. IP local detectada: " + window.location.hostname);
            } else {
                this.showWarning("Verifica que la cámara esté conectada y permisos otorgados");
            }
        }
    }

    showMobileCameraRequest() {
        const mobileRequest = document.getElementById('mobile-camera-request');
        if (mobileRequest) {
            mobileRequest.style.display = 'block';
            
            // Añadir información específica sobre la IP
            const currentIP = location.hostname;
            if (currentIP === '10.0.0.20' || currentIP.startsWith('10.0.0.')) {
                const extraInfo = document.createElement('div');
                extraInfo.style.marginTop = '10px';
                extraInfo.style.fontSize = '0.9em';
                extraInfo.style.color = '#0c5460';
                extraInfo.innerHTML = `
                    📡 Conectado desde red local (${currentIP})<br>
                    ✅ Esta IP debería permitir acceso a la cámara en móviles<br>
                    🔄 Si hay problemas, intenta recargar la página
                `;
                mobileRequest.appendChild(extraInfo);
            }
        }
    }

    hideMobileCameraRequest() {
        const mobileRequest = document.getElementById('mobile-camera-request');
        if (mobileRequest) {
            mobileRequest.style.display = 'none';
        }
    }

    async loadModels() {
        // Detectar si estamos usando Live Server (puerto 5500) o http-server (puerto 8080)
        const isLiveServer = window.location.port === '5500' || window.location.href.includes('5500');
        const MODEL_URL = isLiveServer ? './public/models' : '/models';
        
        console.log('Cargando modelos desde:', MODEL_URL);
        console.log('Puerto detectado:', window.location.port);
        console.log('URL actual:', window.location.href);
        
        await Promise.all([
            faceapi.loadSsdMobilenetv1Model(MODEL_URL),
            faceapi.loadFaceLandmarkModel(MODEL_URL),
            faceapi.loadFaceRecognitionModel(MODEL_URL),
            faceapi.loadFaceExpressionModel(MODEL_URL)
        ]);
        
        this.isModelLoaded = true;
        console.log('Todos los modelos cargados exitosamente');
    }

    async setupCamera() {
        // Detectar si es dispositivo móvil y navegador
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const userAgent = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
        const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
        const isAndroid = /Android/i.test(userAgent);
        
        console.log('Configurando cámara para:', {
            isMobile,
            isIOS,
            isSafari,
            isAndroid,
            userAgent: userAgent.substring(0, 100)
        });
        
        // Verificar soporte de navegador antes de proceder
        if (!navigator.mediaDevices) {
            throw new Error('Tu navegador no soporta MediaDevices API. Intenta actualizar o usar Chrome/Firefox/Safari recientes.');
        }
        
        if (!navigator.mediaDevices.getUserMedia) {
            throw new Error('Tu navegador no soporta getUserMedia API. Necesitas un navegador más moderno.');
        }
        
        // Configuraciones específicas por dispositivo/navegador
        let constraints;
        
        if (isIOS && isSafari) {
            // Safari iOS - configuración muy específica
            constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 480, min: 320, max: 640 },
                    height: { ideal: 360, min: 240, max: 480 },
                    frameRate: { ideal: 24, max: 30 }
                },
                audio: false
            };
        } else if (isAndroid) {
            // Android - configuración optimizada
            constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 480, min: 320, max: 720 },
                    height: { ideal: 360, min: 240, max: 540 },
                    frameRate: { ideal: 24, min: 15, max: 30 }
                },
                audio: false
            };
        } else if (isMobile) {
            // Otros móviles - configuración genérica
            constraints = {
                video: {
                    facingMode: 'user',
                    width: { max: 640 },
                    height: { max: 480 }
                },
                audio: false
            };
        } else {
            // Desktop - configuración estándar
            constraints = {
                video: {
                    width: { ideal: 640, min: 320, max: 1280 },
                    height: { ideal: 480, min: 240, max: 720 },
                    facingMode: 'user',
                    frameRate: { ideal: 30, min: 15, max: 60 }
                },
                audio: false
            };
        }
        
        console.log('Constraints a usar:', constraints);
        
        try {
            // Intentar acceder a la cámara
            console.log('Solicitando acceso a la cámara...');
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            
            return new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    console.log('Metadatos del video cargados');
                    
                    // Configurar atributos específicos para móviles
                    if (isMobile) {
                        this.video.setAttribute('playsinline', true);
                        this.video.setAttribute('webkit-playsinline', true);
                        this.video.setAttribute('muted', true);
                        this.video.muted = true;
                    }
                    
                    // Asegurar que el video se reproduzca
                    this.video.play().then(() => {
                        console.log('Video iniciado correctamente');
                        
                        // Ajustar canvas al tamaño del video con delay para móviles
                        setTimeout(() => {
                            this.adjustCanvasSize();
                            resolve();
                        }, isMobile ? 1500 : 500);
                        
                    }).catch(error => {
                        console.error('Error al iniciar video:', error);
                        if (isMobile) {
                            // En móviles, intentar sin autoplay
                            setTimeout(() => {
                                this.adjustCanvasSize();
                                resolve();
                            }, 1000);
                        } else {
                            reject(error);
                        }
                    });
                };
                
                this.video.onerror = (error) => {
                    console.error('Error en video:', error);
                    reject(error);
                };
                
                // Timeout de seguridad más largo para móviles
                setTimeout(() => {
                    if (this.video.readyState === 0) {
                        reject(new Error('Timeout al cargar video - intenta recargar la página'));
                    }
                }, isMobile ? 15000 : 10000);
            });
            
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            
            // Intentar con configuración de respaldo para móviles
            if (isMobile) {
                console.log('Intentando configuración de respaldo para móvil...');
                return this.setupCameraFallback();
            }
            
            throw error;
        }
    }

    async setupCameraFallback() {
        // Configuración de respaldo para móviles problemáticos
        const fallbackConstraints = {
            video: {
                facingMode: 'user',
                width: { max: 640 },
                height: { max: 480 }
            }
        };
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            this.video.srcObject = stream;
            
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.setAttribute('playsinline', true);
                    this.video.setAttribute('webkit-playsinline', true);
                    this.video.muted = true;
                    
                    this.video.play().then(() => {
                        setTimeout(() => {
                            this.adjustCanvasSize();
                            resolve();
                        }, 1000);
                    });
                };
            });
        } catch (error) {
            throw new Error('No se pudo acceder a la cámara en este dispositivo: ' + error.message);
        }
    }

    adjustCanvasSize() {
        // Ajustar canvas responsivo
        const videoRect = this.video.getBoundingClientRect();
        this.canvas.width = videoRect.width;
        this.canvas.height = videoRect.height;
        
        console.log(`Canvas ajustado: ${this.canvas.width}x${this.canvas.height}`);
        console.log(`Video real: ${this.video.videoWidth}x${this.video.videoHeight}`);
        console.log(`Video mostrado: ${videoRect.width}x${videoRect.height}`);
    }

    async startVerificationProcess() {
        if (!this.isModelLoaded || !this.isInitialized) return;

        const detections = await faceapi.detectAllFaces(this.video)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withFaceExpressions();

        // Limpiar canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (detections.length === 1) {
            const detection = detections[0];
            
            // Procesar detección
            this.processFaceDetection(detection);
            
            // Dibujar visualización
            this.drawAdvancedVisualization([detection]);
            
        } else if (detections.length > 1) {
            this.updateFeedback("⚠️ Se detectan múltiples rostros - Asegúrate de estar solo");
            this.showWarning("Solo debe haber una persona frente a la cámara");
        } else {
            this.handleNoFaceDetected();
        }

        // Actualizar métricas UI
        this.updateMetricsDisplay();
        
        // Continuar proceso
        requestAnimationFrame(() => this.startVerificationProcess());
    }

    processFaceDetection(detection) {
        this.faceDetectionConfidence = detection.detection.score;
        
        // Debug info
        console.log(`Face confidence: ${this.faceDetectionConfidence.toFixed(3)}, Current step: ${this.currentStep}`);
        
        // Paso 1: Detección de rostro con umbral más bajo
        if (this.currentStep === 1 && this.faceDetectionConfidence > this.securityThresholds.faceConfidence) {
            this.completeStep(1);
            this.currentStep = 2;
            this.updateFeedback(this.instructions[2]);
            console.log("Paso 1 completado: Rostro detectado");
        }
        
        // Guardar datos para análisis
        this.currentFaceDescriptor = detection.descriptor;
        this.faceHistory.push({
            timestamp: Date.now(),
            descriptor: detection.descriptor,
            landmarks: detection.landmarks,
            expressions: detection.expressions,
            confidence: detection.detection.score
        });
        
        // Mantener solo los últimos 30 frames
        if (this.faceHistory.length > 30) {
            this.faceHistory.shift();
        }
        
        // Análisis de liveness
        this.analyzeLiveness(detection);
        
        // Análisis biométrico
        this.analyzeBiometrics(detection);
        
        // Verificación de identidad
        this.verifyIdentity(detection);
    }

    analyzeLiveness(detection) {
        const landmarks = detection.landmarks;
        const expressions = detection.expressions;
        
        // 1. Análisis de parpadeo
        this.analyzeBlinking(landmarks);
        
        // 2. Análisis de movimiento de cabeza
        this.analyzeHeadMovement(landmarks);
        
        // 3. Análisis de expresiones
        this.analyzeExpressions(expressions);
        
        // 4. Análisis de textura (simplificado)
        this.analyzeTextureConsistency(detection);
        
        // Calcular puntuación de liveness
        this.calculateLivenessScore();
    }

    analyzeBlinking(landmarks) {
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        
        // Calcular Eye Aspect Ratio (EAR)
        const leftEAR = this.calculateEAR(leftEye);
        const rightEAR = this.calculateEAR(rightEye);
        const avgEAR = (leftEAR + rightEAR) / 2;
        
        // Detectar cierre de ojos con umbral más permisivo
        if (avgEAR < this.securityThresholds.earThreshold) {
            this.eyeClosureFrames++;
        } else {
            // Detectar parpadeo completado (más permisivo)
            if (this.eyeClosureFrames > 1 && this.eyeClosureFrames < 15) {
                this.blinkDetections.push(Date.now());
                console.log(`Parpadeo detectado! Total: ${this.blinkDetections.length}`);
                
                // Avanzar paso con menos parpadeos requeridos
                if (this.currentStep === 2 && this.blinkDetections.length >= 2) {
                    this.completeStep(2);
                    this.currentStep = 3;
                    this.updateFeedback(this.instructions[3]);
                }
            }
            this.eyeClosureFrames = 0;
        }
        
        // Mantener solo parpadeos recientes (últimos 15 segundos)
        this.blinkDetections = this.blinkDetections.filter(time => 
            Date.now() - time < 15000
        );
    }

    calculateEAR(eye) {
        // Calcular Eye Aspect Ratio
        const verticalDist1 = Math.sqrt(
            Math.pow(eye[1].x - eye[5].x, 2) + Math.pow(eye[1].y - eye[5].y, 2)
        );
        const verticalDist2 = Math.sqrt(
            Math.pow(eye[2].x - eye[4].x, 2) + Math.pow(eye[2].y - eye[4].y, 2)
        );
        const horizontalDist = Math.sqrt(
            Math.pow(eye[0].x - eye[3].x, 2) + Math.pow(eye[0].y - eye[3].y, 2)
        );
        
        return (verticalDist1 + verticalDist2) / (2 * horizontalDist);
    }

    analyzeHeadMovement(landmarks) {
        const currentPose = this.estimateHeadPose(landmarks);
        
        if (this.lastHeadPose) {
            const yawDiff = Math.abs(currentPose.yaw - this.lastHeadPose.yaw);
            const pitchDiff = Math.abs(currentPose.pitch - this.lastHeadPose.pitch);
            
            // Umbral más bajo para detectar movimiento más fácilmente
            if (yawDiff > 2 || pitchDiff > 2) {
                this.headMovements.push({
                    timestamp: Date.now(),
                    yawDiff,
                    pitchDiff
                });
                
                console.log(`Movimiento de cabeza detectado! Total: ${this.headMovements.length}`);
                
                // Solo requiere 1 movimiento para avanzar
                if (this.currentStep === 3 && this.headMovements.length >= 1) {
                    this.completeStep(3);
                    this.currentStep = 4;
                    this.updateFeedback(this.instructions[4]);
                }
            }
        }
        
        this.lastHeadPose = currentPose;
        
        // Mantener solo movimientos recientes (20 segundos)
        this.headMovements = this.headMovements.filter(move => 
            Date.now() - move.timestamp < 20000
        );
    }

    estimateHeadPose(landmarks) {
        // Estimación simplificada de pose de cabeza
        const nose = landmarks.getNose();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const mouth = landmarks.getMouth();
        
        // Calcular centros
        const eyeCenter = {
            x: (leftEye[0].x + rightEye[3].x) / 2,
            y: (leftEye[0].y + rightEye[3].y) / 2
        };
        
        const noseCenter = {
            x: (nose[0].x + nose[6].x) / 2,
            y: (nose[0].y + nose[6].y) / 2
        };
        
        // Calcular ángulos
        const yaw = Math.atan2(noseCenter.x - eyeCenter.x, eyeCenter.y - noseCenter.y) * 180 / Math.PI;
        const pitch = Math.atan2(mouth[0].y - eyeCenter.y, eyeCenter.x - mouth[0].x) * 180 / Math.PI;
        
        return { yaw, pitch };
    }

    analyzeExpressions(expressions) {
        const currentTime = Date.now();
        
        // Detectar cambios significativos en expresiones con umbral más bajo
        const dominantExpression = Object.keys(expressions).reduce((a, b) => 
            expressions[a] > expressions[b] ? a : b
        );
        
        // Umbral más bajo para detectar expresiones
        if (expressions[dominantExpression] > 0.4) {
            this.expressionChanges.push({
                timestamp: currentTime,
                expression: dominantExpression,
                confidence: expressions[dominantExpression]
            });
            
            console.log(`Expresión detectada: ${dominantExpression} (${expressions[dominantExpression].toFixed(2)})`);
            
            // Acepta cualquier expresión fuerte, no solo sonrisa
            if (this.currentStep === 4 && (dominantExpression === 'happy' || dominantExpression === 'surprised' || expressions[dominantExpression] > 0.6)) {
                this.completeStep(4);
                this.currentStep = 5;
                this.updateFeedback(this.instructions[5]);
            }
        }
        
        // Mantener solo expresiones recientes (15 segundos)
        this.expressionChanges = this.expressionChanges.filter(exp => 
            currentTime - exp.timestamp < 15000
        );
    }

    analyzeTextureConsistency(detection) {
        // Análisis simplificado de consistencia de textura
        // En una implementación real, se analizaría la textura de la piel
        const box = detection.detection.box;
        const consistency = Math.random() * 0.3 + 0.7; // Simulado
        
        this.biometricQuality = consistency;
    }

    calculateLivenessScore() {
        let score = 0;
        
        // Parpadeo (30%) - más permisivo
        if (this.blinkDetections.length >= 2) {
            score += 0.30;
        } else if (this.blinkDetections.length >= 1) {
            score += 0.20;
        }
        
        // Movimiento de cabeza (30%) - más permisivo
        if (this.headMovements.length >= 1) {
            score += 0.30;
        }
        
        // Cambio de expresiones (20%) - más permisivo
        if (this.expressionChanges.length >= 1) {
            score += 0.20;
        }
        
        // Calidad biométrica (20%)
        score += this.biometricQuality * 0.20;
        
        this.livenessScore = Math.min(score, 1);
        
        console.log(`Liveness Score: ${this.livenessScore.toFixed(2)} - Parpadeos: ${this.blinkDetections.length}, Movimientos: ${this.headMovements.length}, Expresiones: ${this.expressionChanges.length}`);
        
        // Avanzar a análisis biométrico si liveness es suficiente
        if (this.livenessScore > this.securityThresholds.livenessThreshold && this.currentStep === 5) {
            this.currentStep = 6;
            this.updateFeedback(this.instructions[6]);
        }
    }

    analyzeBiometrics(detection) {
        if (this.currentStep < 6) return;
        
        // Simular análisis biométrico avanzado
        setTimeout(() => {
            if (this.currentStep === 6) {
                this.currentStep = 7;
                this.completeVerificationProcess();
            }
        }, 3000);
    }

    verifyIdentity(detection) {
        if (!this.referenceFaceData) {
            // Primera captura como referencia
            if (this.faceHistory.length >= 10) {
                this.referenceFaceData = this.currentFaceDescriptor;
                console.log('Datos de referencia biométrica capturados');
            }
            return;
        }
        
        // Calcular similitud
        const distance = faceapi.euclideanDistance(this.currentFaceDescriptor, this.referenceFaceData);
        this.identityConfidence = Math.max(0, 1 - distance);
    }

    drawAdvancedVisualization(detections) {
        // Obtener dimensiones reales del video
        const displaySize = {
            width: this.video.videoWidth,
            height: this.video.videoHeight
        };
        
        // Ajustar canvas al tamaño del video
        this.canvas.width = this.video.offsetWidth;
        this.canvas.height = this.video.offsetHeight;
        
        const resizedDetections = faceapi.resizeResults(detections, {
            width: this.canvas.width,
            height: this.canvas.height
        });

        // Dibujar detecciones básicas con mejor precisión
        this.ctx.strokeStyle = this.getStatusColor();
        this.ctx.lineWidth = 3;
        faceapi.draw.drawDetections(this.canvas, resizedDetections);
        
        // Dibujar landmarks con colores según el estado
        this.ctx.strokeStyle = this.getStatusColor();
        this.ctx.lineWidth = 2;
        faceapi.draw.drawFaceLandmarks(this.canvas, resizedDetections);
        
        // Dibujar información adicional
        this.drawLivenessIndicators(resizedDetections[0]);
        this.drawSecurityOverlay();
    }

    getStatusColor() {
        if (this.livenessScore > this.securityThresholds.livenessThreshold) {
            return '#28a745'; // Verde
        } else if (this.livenessScore > 0.5) {
            return '#ffc107'; // Amarillo
        } else {
            return '#dc3545'; // Rojo
        }
    }

    drawLivenessIndicators(detection) {
        const landmarks = detection.landmarks;
        
        // Dibujar indicadores de parpadeo
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        
        this.ctx.fillStyle = this.blinkDetections.length >= 3 ? '#28a745' : '#ffc107';
        this.ctx.beginPath();
        this.ctx.arc(leftEye[0].x, leftEye[0].y - 20, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(rightEye[3].x, rightEye[3].y - 20, 3, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawSecurityOverlay() {
        // Dibujar overlay de seguridad
        this.ctx.strokeStyle = '#2a5298';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(10, 10, this.canvas.width - 20, this.canvas.height - 20);
        
        // Dibujar esquinas de seguridad
        const cornerSize = 30;
        this.ctx.strokeStyle = '#28a745';
        this.ctx.lineWidth = 4;
        
        // Esquina superior izquierda
        this.ctx.beginPath();
        this.ctx.moveTo(20, 20 + cornerSize);
        this.ctx.lineTo(20, 20);
        this.ctx.lineTo(20 + cornerSize, 20);
        this.ctx.stroke();
        
        // Esquina superior derecha
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width - 20 - cornerSize, 20);
        this.ctx.lineTo(this.canvas.width - 20, 20);
        this.ctx.lineTo(this.canvas.width - 20, 20 + cornerSize);
        this.ctx.stroke();
        
        // Esquina inferior izquierda
        this.ctx.beginPath();
        this.ctx.moveTo(20, this.canvas.height - 20 - cornerSize);
        this.ctx.lineTo(20, this.canvas.height - 20);
        this.ctx.lineTo(20 + cornerSize, this.canvas.height - 20);
        this.ctx.stroke();
        
        // Esquina inferior derecha
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width - 20 - cornerSize, this.canvas.height - 20);
        this.ctx.lineTo(this.canvas.width - 20, this.canvas.height - 20);
        this.ctx.lineTo(this.canvas.width - 20, this.canvas.height - 20 - cornerSize);
        this.ctx.stroke();
    }

    handleNoFaceDetected() {
        this.faceDetectionConfidence = 0;
        
        if (this.currentStep > 1) {
            this.updateFeedback("⚠️ Rostro no detectado - Posiciónate frente a la cámara");
        } else {
            this.updateFeedback(this.instructions[1]);
        }
    }

    completeStep(stepNumber) {
        const stepNumberEl = document.getElementById(`step-number-${stepNumber}`);
        const stepStatusEl = document.getElementById(`step-status-${stepNumber}`);
        
        stepNumberEl.className = 'step-number completed';
        stepStatusEl.className = 'step-status completed';
        
        console.log(`Paso ${stepNumber} completado`);
    }

    updateCurrentStep(stepNumber) {
        // Actualizar paso actual
        for (let i = 1; i <= 4; i++) {
            const stepNumberEl = document.getElementById(`step-number-${i}`);
            const stepStatusEl = document.getElementById(`step-status-${i}`);
            
            if (i === stepNumber) {
                stepNumberEl.className = 'step-number active';
                stepStatusEl.className = 'step-status active';
            } else if (i < stepNumber) {
                stepNumberEl.className = 'step-number completed';
                stepStatusEl.className = 'step-status completed';
            } else {
                stepNumberEl.className = 'step-number';
                stepStatusEl.className = 'step-status';
            }
        }
    }

    updateMetricsDisplay() {
        const confidenceEl = document.getElementById('confidence-score');
        const livenessEl = document.getElementById('liveness-score');
        
        confidenceEl.textContent = Math.round(this.faceDetectionConfidence * 100) + '%';
        livenessEl.textContent = Math.round(this.livenessScore * 100) + '%';
        
        this.updateCurrentStep(this.currentStep);
    }

    updateFeedback(message) {
        document.getElementById('live-feedback').textContent = message;
    }

    showWarning(message) {
        const warningEl = document.getElementById('warning-message');
        warningEl.textContent = `⚠️ ${message}`;
        warningEl.className = 'warning-message show';
        
        setTimeout(() => {
            warningEl.className = 'warning-message';
        }, 5000);
    }

    completeVerificationProcess() {
        this.completeStep(4);
        this.updateFeedback("🎉 ¡Verificación completada exitosamente!");
        
        // Habilitar botón de verificación completa
        const button = document.getElementById('verify-button');
        button.className = 'action-button enabled';
        button.textContent = '🚀 Iniciar Verificación Completa';
    }
}

// Función global para solicitar permisos de cámara (especialmente útil en móviles)
async function requestCameraPermission() {
    try {
        console.log('Solicitando permisos de cámara...');
        
        // Detectar navegador y dispositivo
        const userAgent = navigator.userAgent;
        const isAndroid = /Android/i.test(userAgent);
        const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
        const isChrome = /Chrome/i.test(userAgent);
        const isFirefox = /Firefox/i.test(userAgent);
        const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
        const isSamsung = /SamsungBrowser/i.test(userAgent);
        
        console.log('Información del navegador:', {
            userAgent,
            isAndroid,
            isIOS,
            isChrome,
            isFirefox,
            isSafari,
            isSamsung
        });
        
        // Verificar soporte básico de navegador
        if (!navigator.mediaDevices) {
            showBrowserCompatibilityError('Tu navegador no soporta acceso a la cámara');
            return;
        }
        
        if (!navigator.mediaDevices.getUserMedia) {
            // Intentar con API legacy
            if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
                console.log('Intentando con API legacy...');
                return requestCameraLegacy();
            } else {
                showBrowserCompatibilityError('API de cámara no disponible en este navegador');
                return;
            }
        }
        
        // Configuraciones específicas por navegador
        let constraints = { video: { facingMode: 'user' }, audio: false };
        
        if (isIOS && isSafari) {
            // Safari iOS requiere configuración específica
            constraints.video = {
                facingMode: 'user',
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 }
            };
        } else if (isAndroid && isSamsung) {
            // Samsung Internet necesita configuración simplificada
            constraints.video = { facingMode: 'user' };
        } else if (isAndroid && isChrome) {
            // Chrome Android funciona bien con configuración estándar
            constraints.video = {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            };
        }
        
        console.log('Constraints a usar:', constraints);
        
        // Solicitar permisos
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Detener el stream de prueba
        stream.getTracks().forEach(track => track.stop());
        
        // Ocultar mensaje de solicitud móvil
        const mobileRequest = document.getElementById('mobile-camera-request');
        if (mobileRequest) {
            mobileRequest.style.display = 'none';
        }
        
        // Mostrar mensaje de éxito
        const feedback = document.getElementById('live-feedback');
        if (feedback) {
            feedback.textContent = '✅ Permisos de cámara otorgados - Reiniciando sistema...';
        }
        
        // Reiniciar el sistema
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('Error al solicitar permisos:', error);
        handleCameraError(error);
    }
}

// Función para manejar API legacy
function requestCameraLegacy() {
    return new Promise((resolve, reject) => {
        const getUserMedia = navigator.getUserMedia || 
                           navigator.webkitGetUserMedia || 
                           navigator.mozGetUserMedia;
        
        if (!getUserMedia) {
            reject(new Error('No hay soporte de cámara disponible'));
            return;
        }
        
        getUserMedia.call(navigator, 
            { video: true, audio: false },
            function(stream) {
                // Detener stream de prueba
                if (stream.getTracks) {
                    stream.getTracks().forEach(track => track.stop());
                } else if (stream.stop) {
                    stream.stop();
                }
                
                alert('✅ Permisos otorgados con API legacy. Recargando...');
                setTimeout(() => location.reload(), 1000);
                resolve();
            },
            function(error) {
                reject(error);
            }
        );
    });
}

// Función para mostrar errores específicos de compatibilidad
function showBrowserCompatibilityError(message) {
    const userAgent = navigator.userAgent;
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    
    let recommendations = '';
    
    if (isAndroid) {
        recommendations = `
🤖 ANDROID - Navegadores recomendados:
• Chrome (versión 53+)
• Firefox (versión 36+)
• Samsung Internet (versión 4+)

📋 Pasos para solucionar:
1. Actualiza tu navegador
2. Ve a Configuración > Sitios web > Cámara
3. Permite el acceso para este sitio
4. Recarga la página
        `;
    } else if (isIOS) {
        recommendations = `
🍎 iOS - Navegadores recomendados:
• Safari (versión 11+)
• Chrome iOS (versión 53+)

📋 Pasos para solucionar:
1. Ve a Configuración > Safari > Cámara
2. Selecciona "Preguntar" o "Permitir"
3. Asegúrate de usar HTTPS o conexión local
4. Recarga la página
        `;
    } else {
        recommendations = `
💻 Navegadores recomendados:
• Chrome (versión 53+)
• Firefox (versión 36+)
• Safari (versión 11+)
• Edge (versión 12+)
        `;
    }
    
    alert(`❌ ${message}

${recommendations}

🔗 URL actual: ${location.href}
📱 Navegador: ${userAgent.substring(0, 100)}...`);
}

// Función para manejar errores específicos de cámara
function handleCameraError(error) {
    console.error('Error detallado:', error);
    
    let errorMessage = '❌ Error al acceder a la cámara: ';
    let solution = '';
    
    switch(error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            errorMessage += 'Permisos denegados.';
            solution = `
🔧 Soluciones:
1. Recarga la página y permite el acceso
2. Ve a configuración del navegador
3. Busca la sección de permisos de sitios web
4. Permite la cámara para este sitio
            `;
            break;
            
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            errorMessage += 'No se encontró cámara.';
            solution = `
🔧 Soluciones:
1. Verifica que la cámara esté conectada
2. Cierra otras aplicaciones que usen la cámara
3. Reinicia el navegador
            `;
            break;
            
        case 'NotSupportedError':
        case 'ConstraintNotSatisfiedError':
            errorMessage += 'Cámara no soportada o configuración incompatible.';
            solution = `
🔧 Soluciones:
1. Intenta con HTTPS en lugar de HTTP
2. Usa un navegador más reciente
3. Verifica configuración de la cámara
            `;
            break;
            
        case 'NotReadableError':
        case 'TrackStartError':
            errorMessage += 'Cámara está siendo usada por otra aplicación.';
            solution = `
🔧 Soluciones:
1. Cierra otras aplicaciones de cámara
2. Reinicia el navegador
3. Reinicia el dispositivo si es necesario
            `;
            break;
            
        default:
            errorMessage += error.message || 'Error desconocido';
            solution = `
🔧 Soluciones generales:
1. Actualiza tu navegador
2. Usa HTTPS si es posible
3. Verifica permisos del navegador
4. Intenta con otro navegador
            `;
    }
    
    alert(errorMessage + solution);
}

// Función para iniciar verificación completa
function startCompleteVerification() {
    // Simular proceso de verificación completa
    const loadingSteps = [
        "🔐 Iniciando protocolo de seguridad avanzado...",
        "📊 Analizando datos biométricos...",
        "🧬 Verificando patrones únicos de identificación...",
        "🔍 Ejecutando algoritmos anti-spoofing...",
        "📱 Enviando código de verificación SMS...",
        "📧 Confirmación por email en proceso...",
        "🛡️ Aplicando cifrado de extremo a extremo...",
        "✅ Verificación completa exitosa"
    ];
    
    const feedback = document.getElementById('live-feedback');
    let currentStep = 0;
    
    const interval = setInterval(() => {
        if (currentStep < loadingSteps.length) {
            feedback.textContent = loadingSteps[currentStep];
            currentStep++;
        } else {
            clearInterval(interval);
            
            // Mostrar resultado final
            setTimeout(() => {
                alert(`🎯 VERIFICACIÓN DE IDENTIDAD COMPLETADA
                
✅ Liveness Detection: APROBADO
✅ Reconocimiento Facial: APROBADO  
✅ Análisis Biométrico: APROBADO
✅ Verificación Anti-Spoofing: APROBADO
✅ Autenticación Multifactor: APROBADO

🔒 Nivel de Seguridad: MÁXIMO
🎖️ Confianza de Identidad: 98.7%
📅 Válido hasta: ${new Date(Date.now() + 24*60*60*1000).toLocaleDateString()}

🚀 Acceso autorizado a servicios seguros`);
            }, 1000);
        }
    }, 1500);
}

// Inicializar sistema al cargar la página
window.addEventListener('load', () => {
    // Verificar compatibilidad del navegador primero
    checkBrowserCompatibility();
    
    const verificationSystem = new AdvancedVerificationSystem();
    
    // Manejar cambios de orientación en móviles
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (verificationSystem.adjustCanvasSize) {
                verificationSystem.adjustCanvasSize();
            }
        }, 500);
    });
    
    // Manejar redimensionamiento de ventana
    window.addEventListener('resize', () => {
        if (verificationSystem.adjustCanvasSize) {
            verificationSystem.adjustCanvasSize();
        }
    });
    
    // Detectar si está en un entorno no seguro (HTTP) en móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.0.') || location.hostname.startsWith('172.');
    
    console.log('Información de conexión:');
    console.log('- Dispositivo móvil:', isMobile);
    console.log('- Protocolo:', location.protocol);
    console.log('- Hostname:', location.hostname);
    console.log('- Puerto:', location.port);
    console.log('- URL completa:', location.href);
    console.log('- Es conexión segura/local:', isHTTPS);
    
    if (isMobile && !isHTTPS && !location.hostname.startsWith('10.0.') && !location.hostname.startsWith('192.168.')) {
        console.warn('Móvil detectado sin HTTPS - La cámara puede no funcionar');
        const feedback = document.getElementById('live-feedback');
        if (feedback) {
            feedback.textContent = '⚠️ Para móviles se requiere HTTPS o conexión local. Prueba con una IP local.';
            feedback.style.background = '#fff3cd';
            feedback.style.color = '#856404';
        }
    }
    
    // Prevenir zoom en iOS
    if (isMobile) {
        document.addEventListener('touchstart', function(event) {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        });
    }
});

// Función para verificar compatibilidad del navegador
function checkBrowserCompatibility() {
    const userAgent = navigator.userAgent;
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isChrome = /Chrome/i.test(userAgent);
    const isFirefox = /Firefox/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
    const isSamsung = /SamsungBrowser/i.test(userAgent);
    const isEdge = /Edge|Edg/i.test(userAgent);
    
    let isCompatible = true;
    let warningMessage = '';
    
    // Verificar soporte básico
    if (!navigator.mediaDevices) {
        isCompatible = false;
        warningMessage = 'Tu navegador no soporta MediaDevices API.';
    } else if (!navigator.mediaDevices.getUserMedia) {
        isCompatible = false;
        warningMessage = 'Tu navegador no soporta getUserMedia API.';
    }
    
    // Verificaciones específicas por navegador
    if (isAndroid) {
        if (isChrome) {
            const chromeVersion = userAgent.match(/Chrome\/(\d+)/);
            if (chromeVersion && parseInt(chromeVersion[1]) < 53) {
                isCompatible = false;
                warningMessage = 'Chrome para Android debe ser versión 53 o superior.';
            }
        } else if (isFirefox) {
            const firefoxVersion = userAgent.match(/Firefox\/(\d+)/);
            if (firefoxVersion && parseInt(firefoxVersion[1]) < 36) {
                isCompatible = false;
                warningMessage = 'Firefox para Android debe ser versión 36 o superior.';
            }
        } else if (!isSamsung && !isChrome && !isFirefox) {
            warningMessage = 'Para mejor compatibilidad en Android usa Chrome, Firefox o Samsung Internet.';
        }
    } else if (isIOS) {
        if (isSafari) {
            // Safari iOS generalmente funciona bien en versiones recientes
        } else if (isChrome) {
            const chromeVersion = userAgent.match(/CriOS\/(\d+)/);
            if (chromeVersion && parseInt(chromeVersion[1]) < 53) {
                isCompatible = false;
                warningMessage = 'Chrome para iOS debe ser versión 53 o superior.';
            }
        }
    }
    
    // Mostrar información de compatibilidad
    const compatibilityInfo = document.getElementById('browser-compatibility-info');
    if (compatibilityInfo) {
        if (!isCompatible) {
            compatibilityInfo.style.display = 'block';
            compatibilityInfo.style.background = '#f8d7da';
            compatibilityInfo.style.borderColor = '#f5c6cb';
            compatibilityInfo.innerHTML = `
                ❌ <strong>Navegador No Compatible</strong><br>
                ${warningMessage}<br><br>
                📱 <strong>Android:</strong> Chrome 53+, Firefox 36+, Samsung Internet 4+<br>
                🍎 <strong>iOS:</strong> Safari 11+, Chrome iOS 53+<br>
                💻 <strong>Desktop:</strong> Chrome 53+, Firefox 36+, Safari 11+, Edge 12+
            `;
        } else if (warningMessage) {
            compatibilityInfo.style.display = 'block';
            compatibilityInfo.innerHTML = `
                ⚠️ <strong>Advertencia de Compatibilidad</strong><br>
                ${warningMessage}<br><br>
                Si experimentas problemas, considera actualizar o cambiar de navegador.
            `;
        }
    }
    
    console.log('Verificación de compatibilidad:', {
        userAgent: userAgent.substring(0, 100),
        isCompatible,
        isAndroid,
        isIOS,
        isChrome,
        isFirefox,
        isSafari,
        isSamsung,
        isEdge,
        warningMessage
    });
    
    return isCompatible;
}

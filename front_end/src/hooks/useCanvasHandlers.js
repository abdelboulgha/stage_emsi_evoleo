import { useCallback } from 'react';

export const useCanvasHandlers = (dataPrepState, setDataPrepState, manualDrawState, setManualDrawState, showNotification, ocrPreviewManual, setOcrPreviewFields) => {
  const findClickedBox = useCallback(
    (x, y) => {
      if (!dataPrepState.ocrBoxes || dataPrepState.ocrBoxes.length === 0) {
        return null;
      }

      for (const box of dataPrepState.ocrBoxes) {
        if (!box.coords) continue;

        const boxLeft = box.coords.left;
        const boxTop = box.coords.top;
        const boxRight = boxLeft + box.coords.width;
        const boxBottom = boxTop + box.coords.height;

        if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
          return box;
        }
      }

      return null;
    },
    [dataPrepState.ocrBoxes]
  );

  const handleCanvasMouseDown = useCallback(
    (event, canvasRef) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const xAffiche = (event.clientX - rect.left);
      const yAffiche = (event.clientY - rect.top);

      // Taille logique du canvas (attributs width/height)
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;

      // Taille affichée à l'écran (CSS)
      const displayWidth = rect.width;
      const displayHeight = rect.height;

      // Taille de l'image OCR
      const imageWidth = dataPrepState.imageDimensions?.width || canvasWidth;
      const imageHeight = dataPrepState.imageDimensions?.height || canvasHeight;

      // Conversion clic -> coordonnées canvas logique
      const xCanvas = xAffiche * (canvasWidth / displayWidth);
      const yCanvas = yAffiche * (canvasHeight / displayHeight);

      // Conversion canvas logique -> image OCR
      const x = xCanvas * (imageWidth / canvasWidth);
      const y = yCanvas * (imageHeight / canvasHeight);

      // Mode dessin manuel
      if (manualDrawState.isDrawing) {
        setManualDrawState((prev) => ({
          ...prev,
          start: { x, y },
          rect: null,
        }));
        return;
      }

      // Mode sélection OCR
      if (dataPrepState.isSelecting && dataPrepState.selectedField) {
        console.log("Coordonnées du clic (image OCR) :", x, y); // DEBUG
        if (dataPrepState.ocrBoxes && dataPrepState.ocrBoxes.length > 0) {
          console.log("Première boîte OCR :", dataPrepState.ocrBoxes[0]); // DEBUG
        }
        const clickedBox = findClickedBox(x, y);
        if (clickedBox) {
          const fieldMappingsUpdate = {
            ...dataPrepState.fieldMappings,
            [dataPrepState.selectedField]: {
              left: parseFloat(clickedBox.coords.left),
              top: parseFloat(clickedBox.coords.top),
              width: parseFloat(clickedBox.coords.width),
              height: parseFloat(clickedBox.coords.height),
              manual: false,
            },
          };
          
          setDataPrepState((prev) => ({
            ...prev,
            selectedBoxes: {
              ...prev.selectedBoxes,
              [prev.selectedField]: clickedBox,
            },
            fieldMappings: fieldMappingsUpdate,
            isSelecting: false,
            selectedField: null
           // ocrPreview: `Boîte assignée à ${prev.selectedField}: "${clickedBox.text}"`,
          }));

          // Update ocrPreviewFields to show the text in the "Valeur extraite" field
          setOcrPreviewFields(prev => ({
            ...prev,
            [dataPrepState.selectedField]: clickedBox.text
          }));

          showNotification(
            `Champ "${dataPrepState.selectedField}" mappé avec succès`,
            "success"
          );
        } else {
          // Aucune boîte cliquée
          showNotification(
            "Aucune boîte OCR trouvée à cet emplacement",
            "error"
          );
        }
      }
    },
    [
      dataPrepState.isSelecting,
      dataPrepState.selectedField,
      dataPrepState.currentZoom,
      dataPrepState.fieldMappings,
      findClickedBox,
      manualDrawState.isDrawing,
      setManualDrawState,
      setDataPrepState,
      showNotification,
    ]
  );

  const handleCanvasMouseMove = useCallback(
    (event, canvasRef) => {
      if (manualDrawState.isDrawing && manualDrawState.start) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (event.clientX - rect.left) / dataPrepState.currentZoom;
        const y = (event.clientY - rect.top) / dataPrepState.currentZoom;
        const left = Math.min(manualDrawState.start.x, x);
        const top = Math.min(manualDrawState.start.y, y);
        const width = Math.abs(x - manualDrawState.start.x);
        const height = Math.abs(y - manualDrawState.start.y);
        setManualDrawState((prev) => ({
          ...prev,
          rect: { left, top, width, height },
        }));
      }
    },
    [manualDrawState, dataPrepState.currentZoom, setManualDrawState]
  );

  const handleCanvasMouseUp = useCallback(
    (event) => {
      const MIN_WIDTH = 30;
      const MIN_HEIGHT = 15;
      
      if (
        manualDrawState.isDrawing &&
        manualDrawState.start &&
        manualDrawState.rect
      ) {
        const fieldKey = manualDrawState.fieldKey;
        const rect = manualDrawState.rect;
        // Vérifie la taille minimale
        if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
          showNotification(`Sélection trop petite (minimum ${MIN_WIDTH}×${MIN_HEIGHT} pixels)`, 'error');
          setManualDrawState({
            isDrawing: false,
            fieldKey: null,
            start: null,
            rect: null,
          });
          return;
        }
        setDataPrepState((prev) => ({
          ...prev,
          fieldMappings: {
            ...prev.fieldMappings,
            [fieldKey]: { ...rect, manual: true },
          },
          selectedBoxes: {
            ...prev.selectedBoxes,
            [fieldKey]: { coords: { ...rect }, manual: true },
          },
        }));
        setManualDrawState({
          isDrawing: false,
          fieldKey: null,
          start: null,
          rect: null,
        });
        // --- OCR Preview Call ---
        if (dataPrepState.uploadedImage) {
          ocrPreviewManual(rect, dataPrepState.uploadedImage, dataPrepState).then(result => {
            if (result.success) {
              showNotification(`Texte extrait: ${result.text}`, "success");
              setOcrPreviewFields(prev => ({
                ...prev,
                [fieldKey]: result.text
              }));
            } else {
              showNotification("Erreur OCR: " + result.text, "error");
            }
          });
        }
      }
    },
    [manualDrawState, dataPrepState.uploadedImage, setDataPrepState, setManualDrawState, showNotification, ocrPreviewManual, setOcrPreviewFields]
  );

  const drawOcrBox = useCallback(
    (ctx, box, isSelected, isSelecting) => {
      const x = box.coords.left * dataPrepState.currentZoom;
      const y = box.coords.top * dataPrepState.currentZoom;
      const width = box.coords.width * dataPrepState.currentZoom;
      const height = box.coords.height * dataPrepState.currentZoom;

      let color, fillColor;
      if (isSelected) {
        color = "#22d3ee";
        fillColor = "rgba(34, 211, 238, 0.10)";
      } else if (isSelecting) {
        color = "#3b82f6";
        fillColor = "rgba(59, 130, 246, 0.10)";
      } else {
        color = "#f43f5e";
        fillColor = "rgba(244, 63, 94, 0.07)";
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);
    },
    [dataPrepState.currentZoom]
  );

  const redrawCanvas = useCallback((canvasRef, imageRef) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPrepState.uploadedImage) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imageRef.current && imageRef.current.complete) {
 
      
      
      const scaledWidth = dataPrepState.imageDimensions.width * dataPrepState.currentZoom;
      const scaledHeight = dataPrepState.imageDimensions.height * dataPrepState.currentZoom;
      

      
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      ctx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);
      // Only draw OCR boxes and saved rectangles if not drawing
      if (!manualDrawState.isDrawing) {
        dataPrepState.ocrBoxes.forEach((box) => {
          const isSelected = Object.values(dataPrepState.selectedBoxes).some(
            (selectedBox) => selectedBox.id === box.id
          );
          const isSelecting =
            dataPrepState.isSelecting && dataPrepState.selectedField;
          drawOcrBox(ctx, box, isSelected, isSelecting);
        });
        // Draw saved manual rectangles
        Object.entries(dataPrepState.fieldMappings).forEach(
          ([field, coords]) => {
            if (coords && coords.manual) {
              ctx.save();
              ctx.strokeStyle = "#fbbf24";
              ctx.lineWidth = 2;
              ctx.setLineDash([2, 2]);
              ctx.strokeRect(
                coords.left * dataPrepState.currentZoom,
                coords.top * dataPrepState.currentZoom,
                coords.width * dataPrepState.currentZoom,
                coords.height * dataPrepState.currentZoom
              );
              ctx.restore();
            }
          }
        );
      }
    }
    // Only show the in-progress rectangle if drawing
    if (manualDrawState.isDrawing && manualDrawState.rect) {
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      const { left, top, width, height } = manualDrawState.rect;
      ctx.strokeRect(
        left * dataPrepState.currentZoom,
        top * dataPrepState.currentZoom,
        width * dataPrepState.currentZoom,
        height * dataPrepState.currentZoom
      );
      ctx.restore();
    }
  }, [dataPrepState, manualDrawState, drawOcrBox]);

  return {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    drawOcrBox,
    redrawCanvas,
  };
};
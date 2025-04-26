  # Auto Graphviz
  
  Esta extensión de Visual Studio Code permite trabajar con archivos `.auto` para visualizar autómatas usando Graphviz.
  
  ## Características
  
  - Previsualización en tiempo real de diagramas DOT/Graphviz
  - Enfoque especial en autómatas
  - Comando para copiar como PNG
  - Resaltado de sintaxis para archivos `.auto` y `.dot`
  
  ## Requisitos
  
  - Visual Studio Code 1.60.0 o superior
  - Graphviz instalado en el sistema (comando `dot` disponible en el PATH)
  
  ## Uso
  
  1. Instala la extensión
  2. Crea o abre un archivo con extensión `.auto`
  3. La extensión automáticamente mostrará una previsualización del diagrama
  4. Usa el menú contextual o la paleta de comandos para "Copy as PNG"
  
  ## Ejemplo de archivo .auto
  
  ```dot
  digraph finite_state_machine {
      rankdir=LR;
      size="8,5"
      node [shape = doublecircle]; LR_0 LR_3 LR_4 LR_8;
      node [shape = circle];
      LR_0 -> LR_2 [ label = "SS(B)" ];
      LR_0 -> LR_1 [ label = "SS(S)" ];
      LR_1 -> LR_3 [ label = "S($end)" ];
      LR_2 -> LR_6 [ label = "SS(b)" ];
      LR_2 -> LR_5 [ label = "SS(a)" ];
      LR_2 -> LR_4 [ label = "S(A)" ];
      LR_5 -> LR_7 [ label = "S(b)" ];
      LR_5 -> LR_5 [ label = "S(a)" ];
      LR_6 -> LR_6 [ label = "S(b)" ];
      LR_6 -> LR_5 [ label = "S(a)" ];
      LR_7 -> LR_8 [ label = "S(b)" ];
      LR_7 -> LR_5 [ label = "S(a)" ];
      LR_8 -> LR_6 [ label = "S(b)" ];
      LR_8 -> LR_5 [ label = "S(a)" ];
  }
  ```
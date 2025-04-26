  # Automaton Automator
  
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
  digraph pda {
    rankdir=LR;
    size="8,5"
    
    node [shape = point]; qi
    node [shape = circle]; q1 q2 q3
    node [shape = doublecircle]; q4

    qi -> q1

    q1 -> q2 [label="1,\\epsilon\\to\\empty"]
    q2 -> q1 [label="\\epsilon,\\epsilon\\toB"]
    q1 -> q3 [label="\\epsilon,\\empty\\to$"]
    q2 -> q4 [label="0,A\\to\\epsilon"]
    q3 -> q4 [label="\\epsilon,B\\toA"]
    q4 -> q1 [label="0,$\\to\\epsilon"]
}
  ```
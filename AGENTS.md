\# Reglas globales del proyecto



\## Base de datos heredada



Este sistema usa IDs heredados que pueden venir con espacios a la izquierda o formato fijo.



Regla principal:

NO hacer trim(), parseInt(), Number(), toString().trim() ni normalizaciones destructivas sobre IDs de tablas heredadas salvo que esté explícitamente justificado.



Los IDs deben compararse y guardarse respetando el formato original de la base.



\---



\## Campos críticos



\### Artículos

Tabla: V\_MA\_ARTICULOS



Campos sensibles:

\- IdArticulo

\- V\_MA\_ARTICULOS

\- IdRubro



`IdArticulo` puede venir con espacios. Respetar el valor exacto.



\---



\### Stock

Tabla: V\_MV\_STOCK



Campo:

\- IdArticulo



Regla:

Cuando se grabe o consulte stock en V\_MV\_STOCK, usar el `IdArticulo` con el mismo formato exacto que viene de V\_MA\_ARTICULOS.



Ejemplo:

Si el artículo existe como `'   123'`, no grabar stock como `'123'`.



\---



\### Comprobantes / Insumos

Tabla: V\_MV\_CPTEINSUMOS



Campo:

\- IdArticulo



Regla:

\- Este campo también puede venir con espacios.

\- Debe respetarse EXACTAMENTE el mismo formato que en V\_MA\_ARTICULOS.

\- No convertir a número.

\- No hacer trim().

\- No reconstruir el ID.



Ejemplo:

Si el artículo es `'   45'`, debe guardarse así mismo en V\_MV\_CPTEINSUMOS.



\---



\## Marcas



Tabla de marcas:

\- V\_TA\_TipoArticulo



Campos:

\- idtipo

\- descripcion



En artículos:

\- La marca se guarda en `V\_MA\_ARTICULOS.V\_MA\_ARTICULOS`.



Regla:

Mostrar `descripcion`, guardar `idtipo` respetando formato.



\---



\## Categorías



Tabla de categorías:

\- V\_TA\_Rubros



Campos:

\- IdRubro

\- Descripcion



En artículos:

\- La categoría se guarda en `V\_MA\_ARTICULOS.IdRubro`.



Regla:

Mostrar `Descripcion`, guardar `IdRubro`.



\---



\## Antes de modificar código



Antes de tocar lógica de artículos, stock, marcas, categorías o hijos:



1\. Buscar dónde se obtiene el ID original desde la base.

2\. Mantener ese ID original para guardar cambios relacionados.

3\. No reconstruir IDs manualmente.

4\. No convertir IDs heredados a número.

5\. No eliminar espacios a la izquierda.

6\. Si hace falta mostrar un ID limpio en pantalla, crear una variable separada solo visual, pero nunca usarla para guardar.



\---



\## Regla de oro



Todo campo que represente una clave heredada debe tratarse como string opaco, no como número.



Mal:

```ts

const id = Number(row.IdArticulo)

const id = row.IdArticulo.trim()


# 💅 Loyalty Nails - App de Fidelidad para Manicuristas

Una aplicación web completa y moderna diseñada para salones de belleza y manicuristas independientes. Permite a las clientas escanear un código QR al terminar su servicio, acumular sellos en su tarjeta digital, y **al llegar a 10 servicios, obtener el siguiente totalmente GRATIS**.

---

## 🌟 Características Principales

### 📱 Para las Clientas (Experiencia QR)
- **Escaneo Rápido de QR**: Al terminar el servicio en el salón, la clienta escanea el código con su cámara.
- **Tarjeta de Fidelidad Digital Visual**: Visualiza una tarjeta con 10 sellos en cuadrícula (icono de esmalte 💅 y regalo dorado 🎁).
- **Meta Clara de 10 Servicios**: La app indica exactamente cuántas visitas le faltan para su premio.
- **Premio Desbloqueable**: Al llegar a 10 servicios, se activa una pantalla dorada de felicitaciones con confeti y sonido festivo anunciando su servicio **100% GRATIS**.
- **Recordatorio en Celular**: Guarda los datos de la clienta en su navegador para que en las siguientes visitas solo tenga que pulsar un botón para sellar.
- **Consulta Rápida**: Puede consultar sus sellos acumulados en cualquier momento ingresando su número de teléfono.

### 👩‍💼 Para la Manicurista (Panel de Control `/admin.html`)
- **Registro y Acceso Privado**: Crea tu salón con tu nombre, nombre del estudio, teléfono y contraseña.
- **Generador de Código QR Automático**: Cada manicurista tiene su propio código QR único e irrepetible.
- **Impresión de Cartel para el Salón**: Un clic para imprimir un afiche decorativo listo para poner en tu mesa o mostrador de atención.
- **Directorio de Clientas**: Lista de todas las clientas con su historial de visitas, sellos acumulados y teléfono.
- **Notificaciones por WhatsApp en 1 Clic**: Botón directo para enviar mensajes por WhatsApp a las clientas que están cerca de ganar su premio (ej: 7, 8 o 9 sellos) o que ya tienen su servicio gratis listo para agendar.
- **Registro y Canje Manual**: Permite sumar sellos manualmente si alguna clienta olvidó su celular, y marcar el premio como canjeado.
- **Métricas del Negocio**: Clientas activas, servicios del día, total histórico y servicios gratuitos premiados.

---

## 🚀 Cómo Iniciar la Aplicación

### Opción 1: Con el ejecutable directo
Haz doble clic en el archivo:
```
c:\Users\PC-Core i7\Desktop\codigos\loyalty-app\iniciar.bat
```

### Opción 2: Desde la terminal
```bash
cd "c:\Users\PC-Core i7\Desktop\codigos\loyalty-app"
node server.js
```

---

## 🌐 Enlaces de Acceso

- **Página Principal**: [http://localhost:3000](http://localhost:3000)
- **Panel de la Manicurista**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- **Enlace de Registro por QR**: `http://localhost:3000/visit.html?code=TU_CODIGO`

---

## 🛠️ Tecnologías y Arquitectura

- **Cero Dependencias Externas Frágiles**: Desarrollado con Node.js puro utilizando los módulos nativos de alto rendimiento:
  - `node:sqlite`: Base de datos SQLite integrada (`loyalty.db`) para almacenamiento confiable y persistente.
  - `node:crypto`: Cifrado y hashing seguro de contraseñas con `scrypt`.
  - `node:http`: Servidor HTTP rápido y ligero.
  - Motor de generación de códigos QR vectorial (SVG) 100% en JavaScript puro.
- **Frontend Moderno**: HTML5, CSS3 con diseño responsivo móvil, animaciones, confeti dinámico y Web Audio API.

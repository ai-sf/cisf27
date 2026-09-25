class Pt {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	a: number;
	ci: number;
	constructor(w: number, h: number, minR: number, maxR: number) {
		this.x = Math.random() * w;
		this.y = Math.random() * h;
		this.vx = (Math.random() - 0.5) * 0.12;
		this.vy = (Math.random() - 0.5) * 0.12;
		this.r = minR + Math.random() * (maxR - minR);
		this.a = 0.4 + Math.random() * 0.4;
		this.ci = Math.floor(Math.random() * C.length);
	}
}

const C = ['158,0,45', '203,110,40', '185,91,46'];

export class ParticleCanvas {
	private cv: HTMLCanvasElement;
	private cx: CanvasRenderingContext2D;
	private pts: Pt[] = [];
	private mx = -1e9;
	private my = -1e9;
	private id = 0;
	private dpr = 1;
	private w = 0;
	private h = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.cv = canvas;
		this.cx = canvas.getContext('2d')!;
		this.fit();
		const count = this.w < 640 ? 30 : this.w < 1024 ? 50 : 80;
		const minR = this.w < 640 ? 2 : this.w < 1024 ? 2 : 3;
		const maxR = this.w < 640 ? 4 : this.w < 1024 ? 5 : 7;
		for (let i = 0; i < count; i++) this.pts.push(new Pt(this.w, this.h, minR, maxR));
		this.events();
		this.loop = this.loop.bind(this);
		this.loop();
	}

	private fit() {
		this.dpr = Math.min(devicePixelRatio, 2);
		this.w = innerWidth;
		this.h = innerHeight;
		this.cv.width = this.w * this.dpr;
		this.cv.height = this.h * this.dpr;
		this.cv.style.width = this.w + 'px';
		this.cv.style.height = this.h + 'px';
		this.cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
	}

	private events() {
		const resize = () => {
			const ow = this.w,
				oh = this.h;
			this.fit();
			for (const p of this.pts) {
				p.x *= this.w / ow;
				p.y *= this.h / oh;
			}
		};
		addEventListener('resize', resize);
		addEventListener('mousemove', (e: MouseEvent) => {
			this.mx = e.clientX;
			this.my = e.clientY;
		});
		addEventListener('mouseleave', () => {
			this.mx = -1e9;
			this.my = -1e9;
		});
	}

	private loop() {
		this.cx.clearRect(0, 0, this.w, this.h);
		this.move();
		this.lines();
		this.draw();
		this.id = requestAnimationFrame(this.loop);
	}

	private move() {
		const near = this.mx > 0 && this.my > 0;
		for (const p of this.pts) {
			if (near) {
				const dx = this.mx - p.x;
				const dy = this.my - p.y;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d < 180) {
					const f = (1 - d / 180) * 0.04;
					p.vx += (dx / d) * f;
					p.vy += (dy / d) * f;
				}
			}
			p.x += p.vx;
			p.y += p.vy;
			if (p.x < 0) {
				p.x = this.w;
			}
			if (p.x > this.w) {
				p.x = 0;
			}
			if (p.y < 0) {
				p.y = this.h;
			}
			if (p.y > this.h) {
				p.y = 0;
			}
			const s = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
			if (s > 0.25) {
				p.vx = (p.vx / s) * 0.25;
				p.vy = (p.vy / s) * 0.25;
			}
		}
	}

	private lines() {
		const cx = this.cx;
		for (let i = 0; i < this.pts.length; i++) {
			for (let j = i + 1; j < this.pts.length; j++) {
				const a = this.pts[i],
					b = this.pts[j];
				const dx = a.x - b.x,
					dy = a.y - b.y;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d < 130) {
					cx.strokeStyle = `rgba(${C[i % C.length]},${(1 - d / 130) * 0.5})`;
					cx.lineWidth = 1.2;
					cx.beginPath();
					cx.moveTo(a.x, a.y);
					cx.lineTo(b.x, b.y);
					cx.stroke();
				}
			}
		}
	}

	private draw() {
		const cx = this.cx;
		for (const p of this.pts) {
			cx.beginPath();
			cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			cx.fillStyle = `rgba(${C[0]},${p.a})`;
			cx.fill();
		}
	}

	disconnect() {
		cancelAnimationFrame(this.id);
	}
}

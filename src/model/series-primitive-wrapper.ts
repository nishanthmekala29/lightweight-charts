import { CanvasRenderingTarget2D } from 'fancy-canvas';

import { IPaneRenderer } from '../renderers/ipane-renderer';
import { PriceAxisViewRendererCommonData, PriceAxisViewRendererData } from '../renderers/iprice-axis-view-renderer';
import { TimeAxisViewRenderer } from '../renderers/time-axis-view-renderer';
import { IPaneView } from '../views/pane/ipane-view';
import { IPriceAxisView } from '../views/price-axis/iprice-axis-view';
import { PriceAxisView } from '../views/price-axis/price-axis-view';
import { ITimeAxisView } from '../views/time-axis/itime-axis-view';

import { HoveredObject } from './chart-model';
import { Coordinate } from './coordinate';
import {
	ISeriesPrimitive,
	ISeriesPrimitiveAxisView,
	ISeriesPrimitivePaneRenderer,
	ISeriesPrimitivePaneView,
	SeriesPrimitivePaneViewZOrder,
} from './iseries-primitive';
import { PriceScale } from './price-scale';
import { Series } from './series';
import { AutoscaleInfo } from './series-options';
import { Logical, TimePointIndex } from './time-data';
import { TimeScale } from './time-scale';

class SeriesPrimitiveRendererWrapper implements IPaneRenderer {
	private readonly _baseRenderer: ISeriesPrimitivePaneRenderer;

	public constructor(baseRenderer: ISeriesPrimitivePaneRenderer) {
		this._baseRenderer = baseRenderer;
	}

	public draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		this._baseRenderer.draw(target);
	}

	public drawBackground?(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		this._baseRenderer.drawBackground?.(target);
	}

	public hitTest(x: Coordinate, y: Coordinate): HoveredObject | null {
		return null;
	}
}

interface RendererCache<Base, Wrapper> {
	base: Base;
	wrapper: Wrapper;
}

export interface ISeriesPrimitivePaneViewWrapper extends IPaneView {
	zOrder(): SeriesPrimitivePaneViewZOrder;
}

class SeriesPrimitivePaneViewWrapper implements IPaneView {
	private readonly _paneView: ISeriesPrimitivePaneView;
	private _cache: RendererCache<ISeriesPrimitivePaneRenderer, SeriesPrimitiveRendererWrapper> | null = null;

	public constructor(paneView: ISeriesPrimitivePaneView) {
		this._paneView = paneView;
	}

	public renderer(addAnchors?: boolean): IPaneRenderer | null {
		const baseRenderer = this._paneView.renderer();
		if (baseRenderer === null) {
			return null;
		}
		if (this._cache?.base === baseRenderer) {
			return this._cache.wrapper;
		}
		const wrapper = new SeriesPrimitiveRendererWrapper(baseRenderer);
		this._cache = {
			base: baseRenderer,
			wrapper,
		};
		return wrapper;
	}

	public zOrder(): SeriesPrimitivePaneViewZOrder {
		return this._paneView.zOrder?.() ?? 'normal';
	}
}

class SeriesPrimitiveTimeAxisViewWrapper implements ITimeAxisView {
	private readonly _baseView: ISeriesPrimitiveAxisView;
	private readonly _timeScale: TimeScale;
	private readonly _renderer: TimeAxisViewRenderer = new TimeAxisViewRenderer();

	public constructor(baseView: ISeriesPrimitiveAxisView, timeScale: TimeScale) {
		this._baseView = baseView;
		this._timeScale = timeScale;
	}

	public renderer(): TimeAxisViewRenderer {
		this._renderer.setData({
			width: this._timeScale.width(),
			text: this._baseView.text(),
			coordinate: this._baseView.coordinate(),
			color: this._baseView.textColor(),
			background: this._baseView.backColor(),
			visible: this._baseView.visible?.() ?? true,
			tickVisible: this._baseView.tickVisible?.() ?? true,
		});
		return this._renderer;
	}
}

class SeriesPrimitivePriceAxisViewWrapper extends PriceAxisView {
	private readonly _baseView: ISeriesPrimitiveAxisView;
	private readonly _priceScale: PriceScale;

	public constructor(baseView: ISeriesPrimitiveAxisView, priceScale: PriceScale) {
		super();
		this._baseView = baseView;
		this._priceScale = priceScale;
	}

	protected override _updateRendererData(
		axisRendererData: PriceAxisViewRendererData,
		paneRendererData: PriceAxisViewRendererData,
		commonRendererData: PriceAxisViewRendererCommonData
	): void {
		axisRendererData.visible = false;

		commonRendererData.background = this._baseView.backColor();
		axisRendererData.color = this._baseView.textColor();

		const additionalPadding = 2 / 12 * this._priceScale.fontSize();

		commonRendererData.additionalPaddingTop = additionalPadding;
		commonRendererData.additionalPaddingBottom = additionalPadding;

		commonRendererData.coordinate = this._baseView.coordinate();
		commonRendererData.fixedCoordinate = this._baseView.fixedCoordinate?.() ?? undefined;
		axisRendererData.text = this._baseView.text();
		axisRendererData.visible = this._baseView.visible?.() ?? true;
		axisRendererData.tickVisible = this._baseView.tickVisible?.() ?? true;
	}
}

export class SeriesPrimitiveWrapper {
	private readonly _primitive: ISeriesPrimitive;
	private readonly _series: Series;
	private _paneViewsCache: RendererCache<readonly ISeriesPrimitivePaneView[], readonly SeriesPrimitivePaneViewWrapper[]> | null = null;
	private _timeAxisViewsCache: RendererCache<readonly ISeriesPrimitiveAxisView[], readonly SeriesPrimitiveTimeAxisViewWrapper[]> | null = null;
	private _priceAxisViewsCache: RendererCache<readonly ISeriesPrimitiveAxisView[], readonly SeriesPrimitivePriceAxisViewWrapper[]> | null = null;
	private _priceAxisPaneViewsCache: RendererCache<readonly ISeriesPrimitivePaneView[], readonly SeriesPrimitivePaneViewWrapper[]> | null = null;
	private _timeAxisPaneViewsCache: RendererCache<readonly ISeriesPrimitivePaneView[], readonly SeriesPrimitivePaneViewWrapper[]> | null = null;

	public constructor(primitive: ISeriesPrimitive, series: Series) {
		this._primitive = primitive;
		this._series = series;
	}

	public primitive(): ISeriesPrimitive {
		return this._primitive;
	}

	public updateAllViews(): void {
		this._primitive.updateAllViews?.();
	}

	public paneViews(): readonly ISeriesPrimitivePaneViewWrapper[] {
		const base = this._primitive.paneViews?.() ?? [];
		if (this._paneViewsCache?.base === base) {
			return this._paneViewsCache.wrapper;
		}
		const wrapper = base.map((pw: ISeriesPrimitivePaneView) => new SeriesPrimitivePaneViewWrapper(pw));
		this._paneViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public timeAxisViews(): readonly ITimeAxisView[] {
		const base = this._primitive.timeAxisViews?.() ?? [];
		if (this._timeAxisViewsCache?.base === base) {
			return this._timeAxisViewsCache.wrapper;
		}
		const timeScale = this._series.model().timeScale();
		const wrapper = base.map((aw: ISeriesPrimitiveAxisView) => new SeriesPrimitiveTimeAxisViewWrapper(aw, timeScale));
		this._timeAxisViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public priceAxisViews(): readonly IPriceAxisView[] {
		const base = this._primitive.priceAxisViews?.() ?? [];
		if (this._priceAxisViewsCache?.base === base) {
			return this._priceAxisViewsCache.wrapper;
		}
		const priceScale = this._series.priceScale();
		const wrapper = base.map((aw: ISeriesPrimitiveAxisView) => new SeriesPrimitivePriceAxisViewWrapper(aw, priceScale));
		this._priceAxisViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public priceAxisPaneViews(): readonly ISeriesPrimitivePaneViewWrapper[] {
		const base = this._primitive.priceAxisPaneViews?.() ?? [];
		if (this._priceAxisPaneViewsCache?.base === base) {
			return this._priceAxisPaneViewsCache.wrapper;
		}
		const wrapper = base.map((pw: ISeriesPrimitivePaneView) => new SeriesPrimitivePaneViewWrapper(pw));
		this._priceAxisPaneViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public timeAxisPaneViews(): readonly ISeriesPrimitivePaneViewWrapper[] {
		const base = this._primitive.timeAxisPaneViews?.() ?? [];
		if (this._timeAxisPaneViewsCache?.base === base) {
			return this._timeAxisPaneViewsCache.wrapper;
		}
		const wrapper = base.map((pw: ISeriesPrimitivePaneView) => new SeriesPrimitivePaneViewWrapper(pw));
		this._timeAxisPaneViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public autoscaleInfo(
		startTimePoint: TimePointIndex,
		endTimePoint: TimePointIndex
	): AutoscaleInfo | null {
		return (
			this._primitive.autoscaleInfo?.(
				startTimePoint as unknown as Logical,
				endTimePoint as unknown as Logical
			) ?? null
		);
	}
}

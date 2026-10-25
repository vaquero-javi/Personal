import Charts
import SomniDesign
import SomniKit
import SwiftUI

/// Pestaña Estadísticas: cuánto duermes, cuántos ciclos completas, cuánto tardas en dormirte
/// y a qué horas. Sigue el lenguaje de Reloj (fondo negro, acento naranja) con tarjetas de Salud.
struct StatsTabView: View {
    @ObservedObject var store: PhoneSessionStore
    @AppStorage("SomniStatsPeriod") private var period: StatsPeriod = .week
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var interval: DateInterval? { period.interval(endingAt: .now) }
    private var summary: SleepSummary { SleepStatistics.summary(of: store.records, in: interval) }
    private var previous: SleepSummary? {
        period.interval(endingAt: .now, offset: 1).map { SleepStatistics.summary(of: store.records, in: $0) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.records.isEmpty {
                    ContentUnavailableView(
                        "Sin datos de sueño",
                        systemImage: "chart.bar.xaxis",
                        description: Text("Cuando termines una siesta o una noche con el Apple Watch, aquí verás cuánto has dormido y los ciclos que has completado.")
                    )
                } else {
                    content
                }
            }
            .navigationTitle("Estadísticas")
        }
    }

    private var content: some View {
        let summary = summary
        return List {
            Section {
                Picker("Periodo", selection: $period) {
                    Text("Semana").tag(StatsPeriod.week)
                    Text("Mes").tag(StatsPeriod.month)
                    Text("Todo").tag(StatsPeriod.all)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
            }

            if summary.sessions.isEmpty {
                Section {
                    Text("No hay sesiones en este periodo.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section {
                    SleepOverviewCard(summary: summary, previous: previous, period: period, interval: interval)
                }

                if let last = summary.nights.first(where: { $0.sleepDuration != nil }) {
                    Section("Última noche") {
                        NavigationLink {
                            SessionDetailView(metrics: last)
                        } label: {
                            CycleTimelineCard(metrics: last)
                        }
                    }
                }

                Section {
                    MetricGrid(summary: summary, streak: SleepStatistics.streak(of: store.records))
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }

                if summary.nights.contains(where: { $0.sleepDuration != nil }) {
                    Section {
                        CyclesChart(nights: summary.nights)
                    } header: {
                        Text("Ciclos por noche")
                    } footer: {
                        Text("Un ciclo dura unos 90 minutos (el primero, unos 85). Despertar al final de uno reduce la sensación de aturdimiento.")
                    }
                }

                if summary.sessions.contains(where: \.onsetDetected) {
                    Section("Tiempo hasta dormirte") {
                        LatencyChart(sessions: summary.sessions, average: summary.averageLatency)
                    }
                }

                Section("Sesiones") {
                    ForEach(summary.sessions) { session in
                        NavigationLink {
                            SessionDetailView(metrics: session)
                        } label: {
                            SessionRow(metrics: session)
                        }
                    }
                }
            }
        }
        .animation(Motion.state(reduceMotion: reduceMotion), value: period)
        #if DEBUG
        .task { await runDemoTour() }
        #endif
    }

    #if DEBUG
    /// Recorrido para el vídeo promocional (`-SomniDemo stats`): cambia a Mes y baja despacio por las tarjetas.
    private func runDemoTour() async {
        guard UserDefaults.standard.string(forKey: "SomniDemo") == "stats" else { return }
        try? await Task.sleep(for: .seconds(2.5))
        period = .month
        try? await Task.sleep(for: .seconds(2.5))
        // `scrollPosition` no mueve un List: se desplaza la vista de UIKit que hay debajo.
        guard let scroll = Self.largestScrollView() else { return }
        let top = scroll.contentOffset.y
        let distance = min(1500, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom - top)
        let steps = 480
        for step in 0...steps {
            let x = Double(step) / Double(steps)
            scroll.contentOffset.y = top + distance * (0.5 - 0.5 * cos(.pi * x))
            try? await Task.sleep(for: .seconds(1.0 / 60))
        }
    }

    private static func largestScrollView() -> UIScrollView? {
        func all(in view: UIView) -> [UIScrollView] {
            ((view as? UIScrollView).map { [$0] } ?? []) + view.subviews.flatMap(all)
        }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.flatMap(all)
            .filter { $0.window != nil && !$0.isHidden && $0.contentSize.height > $0.bounds.height }
            .max { $0.bounds.height < $1.bounds.height }
    }
    #endif
}

// MARK: - Resumen

private struct SleepOverviewCard: View {
    let summary: SleepSummary
    let previous: SleepSummary?
    let period: StatsPeriod
    let interval: DateInterval?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false

    /// Con "Todo" cada barra es la media diaria de una semana, para que la gráfica siga siendo legible.
    private var unit: Calendar.Component { period == .all ? .weekOfYear : .day }
    private var bars: [DailySleep] { period == .all ? summary.weeklyAverages() : summary.daily(in: interval) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(summary.averageNightSleep == nil ? "SIESTAS DE MEDIA" : "MEDIA POR NOCHE")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(StatsFormat.duration(summary.averageNightSleep ?? summary.averageNapSleep ?? 0))
                    .font(ClockStyle.time(40))
                    .contentTransition(.numericText())
                if let delta {
                    Text(delta)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Chart(bars) { day in
                BarMark(
                    x: .value("Día", day.day, unit: unit),
                    y: .value("Horas", grown ? day.night / 3600 : 0)
                )
                .foregroundStyle(by: .value("Tipo", "Noche"))
                BarMark(
                    x: .value("Día", day.day, unit: unit),
                    y: .value("Horas", grown ? day.nap / 3600 : 0)
                )
                .foregroundStyle(by: .value("Tipo", "Siesta"))
            }
            .chartForegroundStyleScale(["Noche": Color.orange, "Siesta": Color.orange.opacity(0.4)])
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel { Text("\(value.as(Double.self).map { Int($0) } ?? 0) h") }
                }
            }
            .chartXAxis {
                if period == .week {
                    AxisMarks(values: .stride(by: .day)) { _ in
                        AxisValueLabel(format: .dateTime.weekday(.narrow), centered: true)
                    }
                } else {
                    AxisMarks()
                }
            }
            .chartLegend(position: .bottom, alignment: .leading)
            .frame(height: 180)
            .onAppear {
                withAnimation(reduceMotion ? nil : Motion.signature(Motion.reveal)) { grown = true }
            }

            if period == .all {
                Text("Cada barra es la media diaria de una semana.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Text("\(StatsFormat.duration(summary.totalSleep)) en total · \(summary.nights.count) noches · \(summary.naps.count) siestas")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }

    private var delta: String? {
        guard let current = summary.averageNightSleep, let before = previous?.averageNightSleep else { return nil }
        let minutes = Int(((current - before) / 60).rounded())
        let name = period == .week ? "a la semana anterior" : "al mes anterior"
        if minutes == 0 { return period == .week ? "Igual que la semana anterior" : "Igual que el mes anterior" }
        return "\(minutes > 0 ? "+" : "−")\(StatsFormat.duration(Double(abs(minutes)) * 60)) respecto \(name)"
    }
}

// MARK: - Línea de ciclos

/// Barra de la noche dividida en ciclos: cada tramo es un ciclo completo, el último tramo
/// gris es el sueño que quedó tras el último ciclo (o el que se cortó por la alarma).
struct CycleTimelineCard: View {
    let metrics: SessionMetrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drawn = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(StatsFormat.duration(metrics.sleepDuration ?? 0))
                    .font(ClockStyle.time(32))
                Spacer()
                Text("\(metrics.completedCycles) \(metrics.completedCycles == 1 ? "ciclo" : "ciclos")")
                    .font(.headline)
                    .foregroundStyle(.orange)
            }
            if let onset = metrics.record.onset {
                segments(onset: onset)
                HStack {
                    Label(ClockStyle.shortTime(onset), systemImage: "moon.zzz.fill")
                    Spacer()
                    Label(ClockStyle.shortTime(metrics.wakeDate), systemImage: metrics.wokeInLightSleep ? "sunrise.fill" : "bell.fill")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
        .onAppear {
            withAnimation(reduceMotion ? nil : Motion.signature(Motion.reveal)) { drawn = true }
        }
    }

    private func segments(onset: Date) -> some View {
        let total = max(metrics.wakeDate.timeIntervalSince(onset), 1)
        var starts = [onset] + metrics.cycleBoundaries
        // Con ventana inteligente el último límite puede caer tras el despertar: se recorta.
        starts = starts.map { min($0, metrics.wakeDate) }
        let ends = Array(starts.dropFirst()) + [metrics.wakeDate]
        return GeometryReader { geo in
            HStack(spacing: 3) {
                ForEach(Array(zip(starts, ends).enumerated()), id: \.offset) { index, pair in
                    let width = pair.1.timeIntervalSince(pair.0) / total * (geo.size.width - CGFloat(starts.count - 1) * 3)
                    let isCycle = index < metrics.completedCycles
                    if width > 0.5 {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(isCycle ? Color.orange.opacity(0.55 + 0.45 * Double(index % 2)) : Color(white: 0.3))
                            .frame(width: max(width, 0))
                    }
                }
            }
            .frame(width: geo.size.width, alignment: .leading)
            .mask(alignment: .leading) {
                Rectangle().frame(width: drawn ? geo.size.width : 0)
            }
        }
        .frame(height: 22)
        .accessibilityElement()
        .accessibilityLabel("\(metrics.completedCycles) ciclos completos")
    }
}

// MARK: - Indicadores

private struct MetricGrid: View {
    let summary: SleepSummary
    let streak: Int

    var body: some View {
        let tiles = self.tiles
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(Array(tiles.enumerated()), id: \.element.title) { index, tile in
                MetricTile(tile: tile)
                    // Presupuesto de escalonado < 400 ms: los índices se limitan a 6.
                    .staggeredEntrance(min(index, 6))
            }
        }
    }

    private var tiles: [MetricTile.Model] {
        var result: [MetricTile.Model] = []
        if let cycles = summary.averageCyclesPerNight {
            result.append(.init(title: "Ciclos por noche", value: cycles.formatted(.number.precision(.fractionLength(1))), detail: "\(summary.totalCycles) en total", icon: "arrow.trianglehead.2.clockwise"))
        }
        if let latency = summary.averageLatency {
            result.append(.init(title: "Te duermes en", value: StatsFormat.duration(latency), detail: "de media", icon: "hourglass"))
        }
        if let bedtime = summary.averageBedtime() {
            result.append(.init(title: "Te acuestas", value: StatsFormat.clock(bedtime), detail: "hora media", icon: "moon.fill"))
        }
        if let wake = summary.averageWakeTime() {
            result.append(.init(title: "Te levantas", value: StatsFormat.clock(wake), detail: "hora media", icon: "sun.horizon.fill"))
        }
        if let napAverage = summary.averageNapSleep {
            result.append(.init(title: "Siestas", value: StatsFormat.duration(napAverage), detail: "\(summary.naps.count) · de media", icon: "timer"))
        }
        if let rate = summary.lightSleepWakeRate {
            result.append(.init(title: "En sueño ligero", value: rate.formatted(.percent.precision(.fractionLength(0))), detail: "de los despertares", icon: "sunrise.fill"))
        }
        if let heartRate = summary.medianBaselineHeartRate {
            result.append(.init(title: "Pulso al acostarte", value: "\(Int(heartRate.rounded())) lpm", detail: "mediana", icon: "heart.fill"))
        }
        result.append(.init(title: "Racha", value: "\(streak) \(streak == 1 ? "día" : "días")", detail: "seguidos durmiendo", icon: "flame.fill"))
        // Número par de tarjetas para que la rejilla no deje un hueco.
        if result.count.isMultiple(of: 2) == false {
            result.append(.init(title: "Sesiones", value: "\(summary.sessions.count)", detail: "en el periodo", icon: "list.bullet"))
        }
        return result
    }
}

private struct MetricTile: View {
    struct Model {
        let title: String
        let value: String
        let detail: String
        let icon: String
    }

    let tile: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(tile.title, systemImage: tile.icon)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.orange)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(tile.value)
                .font(ClockStyle.time(28))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
            Text(tile.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Gráficas

private struct CyclesChart: View {
    let nights: [SessionMetrics]

    var body: some View {
        let measured = nights.filter { $0.sleepDuration != nil }
        Chart(measured) { night in
            BarMark(
                x: .value("Noche", night.day(), unit: .day),
                y: .value("Ciclos", night.completedCycles)
            )
            .foregroundStyle(.orange.gradient)
            .cornerRadius(4)
        }
        .chartYScale(domain: 0...max(6, measured.map(\.completedCycles).max() ?? 0))
        .chartYAxis { AxisMarks(position: .leading, values: .stride(by: 1)) }
        .frame(height: 150)
        .padding(.vertical, 6)
    }
}

private struct LatencyChart: View {
    let sessions: [SessionMetrics]
    let average: TimeInterval?

    var body: some View {
        Chart {
            ForEach(sessions.filter(\.onsetDetected)) { session in
                PointMark(
                    x: .value("Fecha", session.record.startedAt),
                    y: .value("Minutos", (session.onsetLatency ?? 0) / 60)
                )
                .foregroundStyle(by: .value("Tipo", session.isNap ? "Siesta" : "Noche"))
            }
            if let average {
                RuleMark(y: .value("Media", average / 60))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("media \(Int((average / 60).rounded())) min")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
            }
        }
        .chartForegroundStyleScale(["Noche": Color.orange, "Siesta": Color.orange.opacity(0.45)])
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine()
                AxisValueLabel { Text("\(value.as(Double.self).map { Int($0) } ?? 0) min") }
            }
        }
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 150)
        .padding(.vertical, 6)
    }
}

// MARK: - Sesiones

private struct SessionRow: View {
    let metrics: SessionMetrics

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: metrics.isNap ? "timer" : "bed.double.fill")
                .foregroundStyle(.orange)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(metrics.isNap ? "Siesta" : "Noche")
                    .font(.headline)
                Text(metrics.record.startedAt.formatted(.dateTime.weekday(.abbreviated).day().month().hour().minute()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(metrics.sleepDuration.map(StatsFormat.duration) ?? "Sin sueño")
                    .font(.body.monospacedDigit())
                if !metrics.isNap || metrics.completedCycles > 0 {
                    Text("\(metrics.completedCycles) \(metrics.completedCycles == 1 ? "ciclo" : "ciclos")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct SessionDetailView: View {
    let metrics: SessionMetrics

    var body: some View {
        List {
            if metrics.sleepDuration != nil {
                Section { CycleTimelineCard(metrics: metrics) }
            }
            Section {
                LabeledContent("Pulsaste Iniciar", value: ClockStyle.shortTime(metrics.record.startedAt))
                if let onset = metrics.record.onset {
                    LabeledContent(metrics.onsetDetected ? "Te dormiste" : "Dormido (estimado)", value: ClockStyle.shortTime(onset))
                }
                if let latency = metrics.onsetLatency, metrics.onsetDetected {
                    LabeledContent("Tardaste en dormirte", value: StatsFormat.duration(latency))
                }
                if let fired = metrics.record.alarmFiredAt {
                    LabeledContent("Sonó la alarma", value: ClockStyle.shortTime(fired))
                }
                LabeledContent("Terminaste", value: ClockStyle.shortTime(metrics.record.stoppedAt))
            }
            Section {
                switch metrics.record.mode {
                case .duration(let minutes):
                    LabeledContent("Siesta programada", value: ClockStyle.napLabel(minutes))
                case .smartWake(let deadline, _):
                    LabeledContent("Hora límite", value: ClockStyle.shortTime(deadline))
                    if let planned = metrics.record.alarm?.completedCycles {
                        LabeledContent("Ciclos previstos", value: "\(planned)")
                    }
                    LabeledContent("Despertar en sueño ligero", value: metrics.wokeInLightSleep ? "Sí" : "No")
                }
                LabeledContent("Ciclos completados", value: "\(metrics.completedCycles)")
                if let heartRate = metrics.record.baselineHeartRate {
                    LabeledContent("Pulso al acostarte", value: "\(Int(heartRate.rounded())) lpm")
                }
            } footer: {
                if metrics.record.alarm?.reason == .failSafe {
                    Text("El reloj no llegó a detectar que te dormiste y usó la hora de seguridad.")
                }
            }
        }
        .navigationTitle(metrics.isNap ? "Siesta" : "Noche")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Formato

enum StatsFormat {
    static func duration(_ seconds: TimeInterval) -> String {
        ClockStyle.napLabel(Int((seconds / 60).rounded()))
    }

    /// Minutos desde las 00:00 en el formato horario del usuario.
    static func clock(_ minutes: Int) -> String {
        let date = Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: .now) ?? .now
        return ClockStyle.shortTime(date)
    }
}

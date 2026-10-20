import Foundation

/// Búfer circular de capacidad fija. Sobrescribe el elemento más antiguo al llenarse,
/// por lo que la memoria es O(capacity) aunque la sesión dure toda la noche.
public struct RingBuffer<Element> {
    public let capacity: Int
    private var storage: [Element?]
    private var head = 0
    public private(set) var count = 0

    public init(capacity: Int) {
        precondition(capacity > 0, "RingBuffer necesita capacidad positiva")
        self.capacity = capacity
        self.storage = Array(repeating: nil, count: capacity)
    }

    public mutating func append(_ element: Element) {
        storage[(head + count) % capacity] = element
        if count < capacity {
            count += 1
        } else {
            head = (head + 1) % capacity
        }
    }

    public mutating func removeAll() {
        storage = Array(repeating: nil, count: capacity)
        head = 0
        count = 0
    }

    public var isEmpty: Bool { count == 0 }
    public var last: Element? { count == 0 ? nil : storage[(head + count - 1) % capacity] }

    /// Elementos en orden cronológico (del más antiguo al más reciente).
    public var elements: [Element] {
        (0..<count).compactMap { storage[(head + $0) % capacity] }
    }
}

extension RingBuffer: Sendable where Element: Sendable {}

/// Pre-buffer de 3–5 minutos de épocas de sensor. Es la "memoria" que permite
/// fechar el `sleepOnset` hacia atrás en el momento de la confirmación.
public struct SleepStateBuffer: Sendable {
    public let window: TimeInterval
    private var ring: RingBuffer<SensorEpoch>

    public init(window: TimeInterval = 5 * 60, epochLength: TimeInterval = 10) {
        self.window = window
        self.ring = RingBuffer(capacity: max(1, Int((window / epochLength).rounded(.up))))
    }

    public mutating func append(_ epoch: SensorEpoch) { ring.append(epoch) }
    public mutating func removeAll() { ring.removeAll() }

    public var epochs: [SensorEpoch] { ring.elements }
    public var latest: SensorEpoch? { ring.last }

    /// Épocas que empiezan en `date` o después.
    public func epochs(since date: Date) -> [SensorEpoch] {
        ring.elements.filter { $0.start >= date }
    }

    /// Épocas cuyo final cae dentro de los últimos `interval` segundos.
    public func epochs(last interval: TimeInterval) -> [SensorEpoch] {
        guard let end = ring.last?.end else { return [] }
        let from = end.addingTimeInterval(-interval)
        return ring.elements.filter { $0.end > from }
    }
}

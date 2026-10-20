import Foundation
import SomniKit

/// Hora límite guardada en la pestaña Ciclos (equivale a una fila de Alarmas en la app Reloj).
/// Solo una puede estar activa: es la que se envía al reloj como `SomniSettings.wakeHour/wakeMinute`.
struct WakeAlarm: Codable, Hashable, Identifiable {
    var id = UUID()
    var hour: Int
    var minute: Int
    var label = ""
    var cycleMinutes = 90
    var smartWindowMinutes = 10
    var isEnabled = true

    var cycle: CycleModel {
        CycleModel(
            firstCycle: TimeInterval(cycleMinutes - 5) * 60,
            cycle: TimeInterval(cycleMinutes) * 60,
            smartWindow: TimeInterval(smartWindowMinutes) * 60
        )
    }

    /// Próxima vez que llega esta hora.
    func deadline(after date: Date = .now) -> Date {
        date.nextOccurrence(hour: hour, minute: minute)
    }

    /// Fecha de hoy con esta hora, para pintarla con `formatted`.
    var displayDate: Date {
        Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: .now) ?? .now
    }

    /// Hora de alarma estimada si el usuario se durmiera en `onset`.
    func estimatedPlan(onset: Date = .now) -> AlarmPlan {
        AlarmPlanner.plan(for: .smartWake(deadline: deadline(after: onset), cycle: cycle), onset: onset)
    }
}

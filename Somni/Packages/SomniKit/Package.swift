// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SomniKit",
    platforms: [
        .iOS(.v18),
        .watchOS(.v11),
        .macOS(.v15) // solo para ejecutar los tests del motor en el Mac
    ],
    products: [
        .library(name: "SomniKit", targets: ["SomniKit"]),
        .library(name: "SomniDesign", targets: ["SomniDesign"])
    ],
    targets: [
        .target(name: "SomniKit"),
        // Lenguaje visual y de movimiento (SwiftUI). Separado para que el dominio siga siendo solo Foundation.
        .target(name: "SomniDesign"),
        .testTarget(name: "SomniKitTests", dependencies: ["SomniKit"])
    ]
)

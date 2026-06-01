import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const COLORS = ['#BA7517', '#4B6BFB', '#7C9B7A', '#C47070', '#E5A93C', '#58B99C', '#7B93B0'];
const GOLD_COLORS = ['#FFD700', '#F59E0B', '#BA7517', '#E5A93C', '#F3F1EC', '#FFA500'];

const ConfettiBurst = forwardRef(({ count = 40, goldOnly = false }, ref) => {
  const [particles, setParticles] = useState([]);

  useImperativeHandle(ref, () => ({
    startBurst() {
      // Initialize particles
      const newParticles = Array.from({ length: count }).map((_, idx) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        const colorPalette = goldOnly ? GOLD_COLORS : COLORS;
        const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        const size = 6 + Math.random() * 8;
        const shape = Math.random() > 0.5 ? 'circle' : 'square';
        
        return {
          id: idx,
          color,
          size,
          shape,
          x: new Animated.Value(screenWidth / 2),
          y: new Animated.Value(screenHeight / 3),
          scale: new Animated.Value(1),
          opacity: new Animated.Value(1),
          angle,
          speed
        };
      });

      setParticles(newParticles);

      // Animate particles
      const animations = newParticles.map((p) => {
        const travelDistance = 150 + Math.random() * 250;
        const targetX = (screenWidth / 2) + Math.cos(p.angle) * travelDistance;
        // Falling down under simulated gravity
        const targetY = (screenHeight / 3) + Math.sin(p.angle) * travelDistance + 300;

        return Animated.parallel([
          Animated.timing(p.x, {
            toValue: targetX,
            duration: 1800 + Math.random() * 1000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(p.y, {
            toValue: targetY,
            duration: 1800 + Math.random() * 1000,
            easing: Easing.out(Easing.linear),
            useNativeDriver: true
          }),
          Animated.timing(p.scale, {
            toValue: 0.1,
            duration: 1800 + Math.random() * 1000,
            useNativeDriver: true
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 1800 + Math.random() * 800,
            useNativeDriver: true
          })
        ]);
      });

      Animated.parallel(animations).start(() => {
        // Clear particles when done
        setParticles([]);
      });
    }
  }));

  if (particles.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            styles.particle,
            {
              backgroundColor: p.color,
              width: p.size,
              height: p.size,
              borderRadius: p.shape === 'circle' ? p.size / 2 : 2,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { scale: p.scale }
              ],
              opacity: p.opacity
            }
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    left: 0,
    top: 0
  }
});

export default ConfettiBurst;
